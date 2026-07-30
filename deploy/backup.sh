#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"
require_root

[ -f "$POSTGRES_ENV" ] || die "$POSTGRES_ENV is missing. Run server setup first."
# This file contains generated base64url values only and is root-readable.
# shellcheck disable=SC1090
source "$POSTGRES_ENV"

mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL_PATH="$BACKUP_DIR/rsvp-$TIMESTAMP.dump"
TEMP_PATH="$FINAL_PATH.partial"

step "Creating production database backup..."
if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  die "$POSTGRES_CONTAINER is not running. Run: sudo rsvp start"
fi

docker exec \
  -e PGPASSWORD="$RSVP_APP_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  pg_dump --host=127.0.0.1 --username=rsvp_app --dbname=rsvp_prod \
  --format=custom --compress=6 --no-owner --no-privileges >"$TEMP_PATH"

[ -s "$TEMP_PATH" ] || die "Backup output was empty."

step "Verifying the backup can be read..."
if ! docker exec -i "$POSTGRES_CONTAINER" pg_restore --list <"$TEMP_PATH" >/dev/null; then
  rm -f "$TEMP_PATH"
  die "Backup verification failed; the incomplete file was removed."
fi

mv "$TEMP_PATH" "$FINAL_PATH"
chmod 0600 "$FINAL_PATH"
sha256sum "$FINAL_PATH" >"$FINAL_PATH.sha256"
ln -sfn "$(basename "$FINAL_PATH")" "$BACKUP_DIR/latest.dump"

# Keep two weeks of nightly backups. Manual backups follow the same policy;
# copy an important one off this machine before it reaches that age.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'rsvp-*.dump' -o -name 'rsvp-*.dump.sha256' \) -mtime +14 -delete

SIZE="$(du -h "$FINAL_PATH" | awk '{print $1}')"
ok "Backup created and verified: $FINAL_PATH ($SIZE)"
info "Latest shortcut: $BACKUP_DIR/latest.dump"