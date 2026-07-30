#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

command -v cloudflared >/dev/null 2>&1 || die "cloudflared is not installed. Run server setup first."
curl -fsS --max-time 5 http://127.0.0.1:3001/api/health >/dev/null \
  || die "The production app is not healthy. Run: sudo rsvp status"

banner "Temporary Cloudflare preview"
info "Cloudflare will print a random https://...trycloudflare.com address."
info "It is temporary and changes every time this command runs."
info "Press Ctrl+C when you are done testing; the app and database stay running."
echo ""

exec cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3001