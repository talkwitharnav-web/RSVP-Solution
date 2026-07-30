#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"
require_root

HOSTNAME="${1:-}"
TUNNEL_NAME="rsvp-production"

[ -n "$HOSTNAME" ] || die "Usage: sudo rsvp domain rsvp.yourdomain.com"
[[ "$HOSTNAME" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
  || die "That does not look like a valid hostname: $HOSTNAME"
command -v cloudflared >/dev/null 2>&1 || die "cloudflared is not installed. Run server setup first."
command -v jq >/dev/null 2>&1 || die "jq is not installed. Run server setup again."

banner "Connect RSVP to $HOSTNAME"
info "The domain must already be active in your Cloudflare account."
info "Cloudflare may print a login URL; open it in any browser and approve this server."

mkdir -p /root/.cloudflared /etc/cloudflared
chmod 0700 /root/.cloudflared /etc/cloudflared

if [ ! -f /root/.cloudflared/cert.pem ]; then
  step "Authorizing this Linux server with Cloudflare..."
  cloudflared tunnel login
else
  ok "Cloudflare authorization already exists."
fi

step "Finding or creating the named tunnel..."
TUNNEL_ID="$(cloudflared tunnel list --output json \
  | jq -r --arg name "$TUNNEL_NAME" '.[] | select(.name == $name) | .id' \
  | head -1)"
if [ -z "$TUNNEL_ID" ]; then
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_ID="$(cloudflared tunnel list --output json \
    | jq -r --arg name "$TUNNEL_NAME" '.[] | select(.name == $name) | .id' \
    | head -1)"
fi
[ -n "$TUNNEL_ID" ] || die "Cloudflare did not return a tunnel ID."
ok "Tunnel: $TUNNEL_NAME ($TUNNEL_ID)"

CREDENTIAL_SOURCE="/root/.cloudflared/$TUNNEL_ID.json"
[ -f "$CREDENTIAL_SOURCE" ] || die "Tunnel credential file is missing: $CREDENTIAL_SOURCE"
install -m 0600 "$CREDENTIAL_SOURCE" "/etc/cloudflared/$TUNNEL_ID.json"

cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json
metrics: 127.0.0.1:20241
ingress:
  - hostname: $HOSTNAME
    service: http://127.0.0.1:3001
  - service: http_status:404
EOF
chmod 0600 /etc/cloudflared/config.yml

step "Validating the tunnel configuration..."
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
ok "Tunnel configuration is valid."

step "Creating the Cloudflare DNS route..."
if ! cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "$HOSTNAME"; then
  err "Cloudflare could not create the DNS record."
  info "A record with that hostname may already exist. Remove the conflicting record in Cloudflare DNS, then re-run this command."
  exit 1
fi

step "Starting the permanent tunnel service..."
systemctl daemon-reload
systemctl enable --now rsvp-cloudflared.service

step "Checking the public address..."
PUBLIC_READY=0
for _ in $(seq 1 24); do
  PUBLIC_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "https://$HOSTNAME/sender/landing" || true)"
  ADMIN_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "https://$HOSTNAME/" || true)"
  if [ "$PUBLIC_STATUS" = "200" ] && [ "$ADMIN_STATUS" = "404" ]; then
    PUBLIC_READY=1
    break
  fi
  sleep 5
done

if [ "$PUBLIC_READY" -eq 1 ]; then
  ok "Public app is live: https://$HOSTNAME"
  ok "Admin remains private (public / returned 404)."
else
  warn "The tunnel is running, but DNS/TLS did not finish propagating during this two-minute check."
  info "Run 'sudo rsvp status' in a few minutes, then open https://$HOSTNAME/sender/landing"
fi