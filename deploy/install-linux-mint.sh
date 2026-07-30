#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"
require_root

REPO_URL="${RSVP_REPO_URL:-https://github.com/talkwitharnav-web/RSVP-Solution.git}"
BRANCH="${RSVP_DEPLOY_BRANCH:-main}"

banner "RSVP Linux Mint server setup"
info "App:        $APP_DIR"
info "Secrets:    /etc/rsvp (never stored in Git)"
info "Database:   private Postgres 16 on 127.0.0.1"
info "Public web: Cloudflare Tunnel (domain can be attached later)"

if [ ! -r /etc/os-release ]; then
  die "Cannot identify this Linux distribution."
fi
# shellcheck disable=SC1091
source /etc/os-release
if [ "${ID:-}" != "linuxmint" ] && [[ " ${ID_LIKE:-} " != *" ubuntu "* ]] && [[ " ${ID_LIKE:-} " != *" debian "* ]]; then
  warn "This installer was written for Linux Mint/Ubuntu; detected ${PRETTY_NAME:-unknown}."
  confirm "Continue anyway?" no || die "Setup cancelled."
else
  ok "Detected ${PRETTY_NAME:-Linux Mint}."
fi

step "Installing base tools..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git jq openssh-server openssl ufw
systemctl enable --now ssh.service

step "Installing Docker Engine and Compose..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
UBUNTU_RELEASE="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[ -n "$UBUNTU_RELEASE" ] || die "Could not determine the Ubuntu base release for Linux Mint."
cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $UBUNTU_RELEASE stable
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker.service
docker info >/dev/null
ok "Docker is installed and running."

step "Installing Node.js 22 LTS..."
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
cat > /etc/apt/sources.list.d/nodesource.list <<'EOF'
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
EOF
apt-get update
apt-get install -y nodejs
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20 or newer is required; found $(node --version)."
ok "Node.js $(node --version) and npm $(npm --version) are installed."

step "Installing Cloudflare Tunnel..."
install -m 0755 -d /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | gpg --dearmor --yes -o /usr/share/keyrings/cloudflare-main.gpg
cat > /etc/apt/sources.list.d/cloudflared.list <<'EOF'
deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main
EOF
apt-get update
apt-get install -y cloudflared
ok "$(cloudflared --version)"

step "Creating the locked-down RSVP service account..."
if ! id rsvp >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /opt/rsvp --shell /usr/sbin/nologin rsvp
fi
install -d -o rsvp -g rsvp /opt/rsvp /opt/rsvp/releases
ok "Service account rsvp is ready."

step "Installing the application from GitHub..."
if [ ! -d "$APP_DIR/.git" ]; then
  runuser -u rsvp -- git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_DIR"
else
  warn "$APP_DIR already exists; preserving its current release."
fi
[ -f "$APP_DIR/deploy/rsvp.sh" ] \
  || die "The GitHub $BRANCH branch does not contain the deployment kit. Commit and push these files, then rerun setup."
chmod +x "$APP_DIR"/server-setup.sh "$APP_DIR"/deploy/*.sh "$APP_DIR"/deploy/postgres/*.sh
chown -R rsvp:rsvp /opt/rsvp

step "Creating private production secrets..."
install -d -m 0700 /etc/rsvp /etc/cloudflared
if [ ! -f "$POSTGRES_ENV" ]; then
  POSTGRES_PASSWORD="$(random_secret)"
  RSVP_APP_PASSWORD="$(random_secret)"
  umask 077
  cat >"$POSTGRES_ENV" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
RSVP_APP_PASSWORD=$RSVP_APP_PASSWORD
EOF
  ok "Generated private Postgres passwords."
else
  ok "Existing Postgres secrets preserved."
fi
# shellcheck disable=SC1090
source "$POSTGRES_ENV"

if [ ! -f "$APP_ENV" ]; then
  SESSION_SECRET="$(random_secret)"
  DEFAULT_ADMIN="admin"
  read -r -p "Admin username [$DEFAULT_ADMIN]: " ADMIN_USERNAME </dev/tty
  ADMIN_USERNAME="${ADMIN_USERNAME:-$DEFAULT_ADMIN}"
  while true; do
    read -r -s -p "Admin password (stored only in /etc/rsvp/app.env): " ADMIN_PASSWORD </dev/tty
    echo ""
    [ -n "$ADMIN_PASSWORD" ] || { warn "Password cannot be empty."; continue; }
    read -r -s -p "Confirm admin password: " ADMIN_PASSWORD_CONFIRM </dev/tty
    echo ""
    [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ] && break
    warn "Passwords did not match; try again."
  done

  DATABASE_URL="postgres://rsvp_app:$RSVP_APP_PASSWORD@127.0.0.1:5432/rsvp_prod"
  umask 077
  {
    printf 'DATABASE_URL=%s\n' "$(systemd_quote "$DATABASE_URL")"
    printf 'SESSION_SECRET=%s\n' "$(systemd_quote "$SESSION_SECRET")"
    printf 'ADMIN_USERNAME=%s\n' "$(systemd_quote "$ADMIN_USERNAME")"
    printf 'ADMIN_PASSWORD=%s\n' "$(systemd_quote "$ADMIN_PASSWORD")"
    printf 'FORCE_SECURE_COOKIES=true\n'
    printf 'HOST=127.0.0.1\n'
    printf 'PORT=3001\n'
    printf 'TRUSTED_PROXY_IPS=127.0.0.1,::1,::ffff:127.0.0.1\n'
  } >"$APP_ENV"
  ok "Generated session secret and saved production settings."
else
  ok "Existing application secrets preserved."
fi
chmod 0600 "$APP_ENV" "$POSTGRES_ENV"

SESSION_SECRET="$(read_simple_env "$APP_ENV" SESSION_SECRET)"
DATABASE_URL="$(read_simple_env "$APP_ENV" DATABASE_URL)"
[ "${#SESSION_SECRET}" -ge 32 ] || die "SESSION_SECRET in $APP_ENV is invalid."

step "Starting private production Postgres..."
docker compose -f "$COMPOSE_FILE" up -d
POSTGRES_READY=0
for _ in $(seq 1 60); do
  STATUS="$(docker inspect "$POSTGRES_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  if [ "$STATUS" = "healthy" ]; then
    POSTGRES_READY=1
    break
  fi
  sleep 1
done
[ "$POSTGRES_READY" -eq 1 ] || die "Postgres did not become healthy. Run: docker logs $POSTGRES_CONTAINER"
docker exec "$POSTGRES_CONTAINER" bash /docker-entrypoint-initdb.d/10-rsvp-app-role.sh >/dev/null
ok "Fresh production database and restricted app role are ready."

step "Installing dependencies and building the optimized app..."
runuser -u rsvp -- bash -c "cd '$APP_DIR' && npm ci"
runuser -u rsvp -- env \
  NODE_ENV=production \
  SESSION_SECRET="$SESSION_SECRET" \
  DATABASE_URL="$DATABASE_URL" \
  FORCE_SECURE_COOKIES=true \
  bash -c "cd '$APP_DIR' && npm run build"
ok "Optimized production build completed."

step "Installing automatic services and the rsvp command..."
install -m 0755 "$APP_DIR/deploy/rsvp.sh" /usr/local/bin/rsvp
install -m 0644 "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rsvp-postgres.service
systemctl enable --now rsvp.service
systemctl enable --now rsvp-backup.timer
wait_for_url "http://127.0.0.1:3001/api/health" 60 \
  || die "App service did not become healthy. Run: sudo rsvp logs app"
ok "App starts automatically and is healthy."

step "Creating and verifying the first backup..."
"$APP_DIR/deploy/backup.sh"

step "Configuring the firewall..."
if confirm "Allow SSH only and block unsolicited inbound connections?" yes; then
  SSH_PORTS="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -u)"
  [ -n "$SSH_PORTS" ] || SSH_PORTS="22"
  while read -r SSH_PORT; do
    [ -n "$SSH_PORT" ] && ufw allow "$SSH_PORT/tcp" comment 'SSH'
  done <<<"$SSH_PORTS"
  ufw default deny incoming
  ufw default allow outgoing
  ufw --force enable
  ok "Firewall enabled. Ports 3001 and 5432 remain loopback-only."
else
  warn "Firewall setup skipped. Run 'sudo ufw status' and configure it before launch."
fi

step "Power behavior..."
if confirm "Is this a dedicated server that should never suspend itself?" yes; then
  systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
  ok "Automatic system suspend is disabled."
else
  warn "Suspend settings were left unchanged; sleeping makes the website unavailable."
fi

echo ""
banner "Linux production setup complete"
"$APP_DIR/deploy/doctor.sh" || true
echo ""
printf '  %sTemporary public test:%s sudo rsvp preview\n' "$C_GREEN" "$C_RESET"
printf '  %sWhen the domain is ready:%s sudo rsvp domain rsvp.yourdomain.com\n' "$C_GREEN" "$C_RESET"
printf '  %sEveryday status check:%s sudo rsvp status\n' "$C_GREEN" "$C_RESET"
printf '  %sFuture code update:%s sudo rsvp update\n' "$C_GREEN" "$C_RESET"