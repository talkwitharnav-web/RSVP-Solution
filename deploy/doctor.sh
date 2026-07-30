#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

banner "RSVP production status"
FAILURES=0

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1: $(command -v "$1")"
  else
    err "$1 is missing"
    FAILURES=$((FAILURES + 1))
  fi
}

step "Required software"
check_command node
check_command npm
check_command docker
check_command cloudflared

step "Automatic services"
for unit in docker.service rsvp-postgres.service rsvp.service rsvp-backup.timer; do
  if systemctl is-active --quiet "$unit"; then
    ok "$unit is active"
  else
    err "$unit is not active"
    FAILURES=$((FAILURES + 1))
  fi
done

if [ -f /etc/cloudflared/config.yml ]; then
  if systemctl is-active --quiet rsvp-cloudflared.service; then
    ok "Cloudflare Tunnel is active"
  else
    err "Cloudflare is configured but its service is not active"
    FAILURES=$((FAILURES + 1))
  fi
else
  warn "Permanent Cloudflare domain is not configured yet"
  info "When the domain is ready: sudo rsvp domain rsvp.yourdomain.com"
fi

step "Private listeners"
if ss -ltn | grep -qE '127\.0\.0\.1:3001\b'; then
  ok "App listens privately on 127.0.0.1:3001"
else
  err "App is not listening privately on port 3001"
  FAILURES=$((FAILURES + 1))
fi
if ss -ltn | grep -qE '127\.0\.0\.1:5432\b'; then
  ok "Postgres listens privately on 127.0.0.1:5432"
else
  err "Postgres is not listening privately on port 5432"
  FAILURES=$((FAILURES + 1))
fi
if ss -ltn | grep -qE '(0\.0\.0\.0|\[::\]):(3001|5432)\b'; then
  err "App or database is unexpectedly listening on every network interface"
  FAILURES=$((FAILURES + 1))
else
  ok "Neither app nor database is directly exposed to the network"
fi

step "Application health"
if HEALTH_JSON="$(curl -fsS --max-time 5 http://127.0.0.1:3001/api/health 2>/dev/null)"; then
  ok "Local health endpoint responds"
  if command -v jq >/dev/null 2>&1; then
    info "Status: $(printf '%s' "$HEALTH_JSON" | jq -r '.tier // .status // "unknown"')"
    info "Database connected: $(printf '%s' "$HEALTH_JSON" | jq -r '.db.connected // "hidden"')"
  fi
else
  err "Local health endpoint is unreachable"
  FAILURES=$((FAILURES + 1))
fi

step "Backups and storage"
LATEST_BACKUP="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'rsvp-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
if [ -n "$LATEST_BACKUP" ]; then
  ok "Latest backup: $LATEST_BACKUP ($(du -h "$LATEST_BACKUP" | awk '{print $1}'))"
else
  warn "No production backup exists yet; run: sudo rsvp backup"
fi
df -h / /opt /var 2>/dev/null | awk 'NR == 1 || !seen[$NF]++ {print "    " $0}'

echo ""
if [ "$FAILURES" -eq 0 ]; then
  ok "Core production services are healthy."
  exit 0
fi

err "$FAILURES production check(s) failed."
exit 1