#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"
require_root

[ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a Git checkout. Run server setup first."
[ -f "$APP_ENV" ] || die "$APP_ENV is missing."

REPO_URL="$(git -C "$APP_DIR" remote get-url origin)"
BRANCH="${RSVP_DEPLOY_BRANCH:-main}"
RELEASE_ROOT="/opt/rsvp/releases"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING="$RELEASE_ROOT/staging-$TIMESTAMP"
PREVIOUS="$RELEASE_ROOT/previous-$TIMESTAMP"
FAILED="$RELEASE_ROOT/failed-$TIMESTAMP"

SESSION_SECRET="$(read_simple_env "$APP_ENV" SESSION_SECRET)"
DATABASE_URL="$(read_simple_env "$APP_ENV" DATABASE_URL)"
[ "${#SESSION_SECRET}" -ge 32 ] || die "SESSION_SECRET in $APP_ENV is invalid."
[ -n "$DATABASE_URL" ] || die "DATABASE_URL in $APP_ENV is missing."

mkdir -p "$RELEASE_ROOT"
chown rsvp:rsvp "$RELEASE_ROOT"

cleanup_staging() {
  if [ -d "$STAGING" ]; then
    rm -rf "$STAGING"
  fi
}
trap cleanup_staging EXIT

banner "Update RSVP production"
step "Downloading the newest $BRANCH code into a separate staging folder..."
runuser -u rsvp -- git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$STAGING"
NEW_COMMIT="$(git -C "$STAGING" rev-parse --short HEAD)"
CURRENT_COMMIT="$(git -C "$APP_DIR" rev-parse --short HEAD)"
info "Current: $CURRENT_COMMIT"
info "Newest:  $NEW_COMMIT"

step "Installing dependencies in staging..."
runuser -u rsvp -- bash -c "cd '$STAGING' && npm ci"

step "Building and checking the new release before touching the running app..."
runuser -u rsvp -- env \
  NODE_ENV=production \
  SESSION_SECRET="$SESSION_SECRET" \
  DATABASE_URL="$DATABASE_URL" \
  FORCE_SECURE_COOKIES=true \
  bash -c "cd '$STAGING' && npm run build"
ok "New release built successfully."

chmod +x "$STAGING"/server-setup.sh "$STAGING"/deploy/*.sh "$STAGING"/deploy/postgres/*.sh
chown -R rsvp:rsvp "$STAGING"

TUNNEL_WAS_ACTIVE=0
if systemctl is-active --quiet rsvp-cloudflared.service; then
  TUNNEL_WAS_ACTIVE=1
  systemctl stop rsvp-cloudflared.service
fi

step "Switching to the new release..."
systemctl stop rsvp.service
mv "$APP_DIR" "$PREVIOUS"
mv "$STAGING" "$APP_DIR"
trap - EXIT

install -m 0755 "$APP_DIR/deploy/rsvp.sh" /usr/local/bin/rsvp
install -m 0644 "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start rsvp-postgres.service
systemctl start rsvp.service

if ! wait_for_url "http://127.0.0.1:3001/api/health" 60; then
  err "The new release did not become healthy; rolling back automatically."
  systemctl stop rsvp.service || true
  mv "$APP_DIR" "$FAILED"
  mv "$PREVIOUS" "$APP_DIR"
  install -m 0755 "$APP_DIR/deploy/rsvp.sh" /usr/local/bin/rsvp
  install -m 0644 "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl start rsvp.service
  [ "$TUNNEL_WAS_ACTIVE" -eq 1 ] && systemctl start rsvp-cloudflared.service
  die "Rollback complete. The failed release is preserved at $FAILED"
fi

if [ "$TUNNEL_WAS_ACTIVE" -eq 1 ]; then
  systemctl start rsvp-cloudflared.service
fi

# Keep the three newest old/failed releases for quick forensic comparison.
find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +4 \
  | cut -d' ' -f2- \
  | xargs -r rm -rf

ok "Production updated from $CURRENT_COMMIT to $NEW_COMMIT."
info "Public service stayed on the old release until the new build passed."