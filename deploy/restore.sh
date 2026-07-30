#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"
require_root

BACKUP_PATH="${1:-}"
[ -n "$BACKUP_PATH" ] || die "Usage: sudo rsvp restore /var/backups/rsvp/rsvp-TIMESTAMP.dump"
BACKUP_PATH="$(readlink -f "$BACKUP_PATH")"
[ -f "$BACKUP_PATH" ] || die "Backup file not found: $BACKUP_PATH"
[ -f "$POSTGRES_ENV" ] || die "$POSTGRES_ENV is missing."
# shellcheck disable=SC1090
source "$POSTGRES_ENV"

step "Checking the selected backup..."
docker exec -i "$POSTGRES_CONTAINER" pg_restore --list <"$BACKUP_PATH" >/dev/null \
  || die "That file is not a readable Postgres backup."
ok "Backup file is readable."

warn "Restore replaces the current production database contents."
read -r -p "Type RESTORE PRODUCTION to continue: " CONFIRMATION </dev/tty
[ "$CONFIRMATION" = "RESTORE PRODUCTION" ] || die "Restore cancelled."

step "Creating a safety backup of the current database first..."
"$SCRIPT_DIR/backup.sh"

if systemctl is-active --quiet rsvp.service; then
  systemctl stop rsvp.service
fi

restart_app() {
  systemctl start rsvp.service || true
}
trap restart_app EXIT

step "Restoring database..."
docker exec -i \
  -e PGPASSWORD="$RSVP_APP_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  pg_restore --host=127.0.0.1 --username=rsvp_app --dbname=rsvp_prod \
  --clean --if-exists --no-owner --no-privileges --exit-on-error <"$BACKUP_PATH"

restart_app
trap - EXIT

if ! wait_for_url "http://127.0.0.1:3001/api/health" 60; then
  die "Restore finished, but the app did not become healthy. Run: sudo rsvp logs app"
fi

ok "Database restored from $BACKUP_PATH"