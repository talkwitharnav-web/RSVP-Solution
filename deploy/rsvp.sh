#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="/opt/rsvp/app/deploy"
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  exec sudo /usr/local/bin/rsvp "$@"
fi

# shellcheck source=deploy/_common.sh
source "$SCRIPT_DIR/_common.sh"

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  start)
    banner "Start RSVP production"
    systemctl start rsvp-postgres.service
    systemctl start rsvp.service
    if [ -f /etc/cloudflared/config.yml ]; then
      systemctl start rsvp-cloudflared.service
    fi
    "$SCRIPT_DIR/doctor.sh"
    ;;
  stop)
    banner "Stop RSVP production"
    systemctl stop rsvp-cloudflared.service 2>/dev/null || true
    systemctl stop rsvp.service
    systemctl stop rsvp-postgres.service
    ok "App, tunnel, and database are stopped. Database files are preserved."
    ;;
  restart)
    banner "Restart RSVP production"
    systemctl start rsvp-postgres.service
    systemctl restart rsvp.service
    if [ -f /etc/cloudflared/config.yml ]; then
      systemctl restart rsvp-cloudflared.service
    fi
    wait_for_url "http://127.0.0.1:3001/api/health" 60 \
      || die "App did not become healthy. Run: sudo rsvp logs app"
    ok "RSVP restarted and is healthy."
    ;;
  status|doctor)
    exec "$SCRIPT_DIR/doctor.sh"
    ;;
  update)
    exec "$SCRIPT_DIR/update.sh" "$@"
    ;;
  backup)
    exec "$SCRIPT_DIR/backup.sh" "$@"
    ;;
  restore)
    exec "$SCRIPT_DIR/restore.sh" "$@"
    ;;
  preview)
    exec "$SCRIPT_DIR/cloudflare-preview.sh" "$@"
    ;;
  domain)
    exec "$SCRIPT_DIR/cloudflare-finish.sh" "$@"
    ;;
  logs)
    TARGET="${1:-app}"
    case "$TARGET" in
      app) exec journalctl -u rsvp.service -f -n 100 ;;
      db) exec docker logs -f --tail 100 "$POSTGRES_CONTAINER" ;;
      tunnel) exec journalctl -u rsvp-cloudflared.service -f -n 100 ;;
      *) die "Usage: sudo rsvp logs [app|db|tunnel]" ;;
    esac
    ;;
  backups)
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'rsvp-*.dump' -printf '%TY-%Tm-%Td %TH:%TM  %10s bytes  %p\n' \
      | sort -r
    ;;
  admin-help)
    cat <<'EOF'
Admin stays private on purpose.

From your normal computer, open an SSH tunnel to the Linux server:

  ssh -L 3001:127.0.0.1:3001 YOUR_LINUX_USER@YOUR_SERVER_IP

Leave that terminal open, then visit http://localhost:3001 in your browser.
Cloudflare visitors will always get a 404 from the admin pages.
EOF
    ;;
  help|-h|--help)
    cat <<'EOF'
RSVP production commands

  sudo rsvp status                 Check every important service
  sudo rsvp start                  Start app, database, and tunnel
  sudo rsvp stop                   Stop everything; preserve all data
  sudo rsvp restart                Restart and verify the app
  sudo rsvp update                 Build newest GitHub code, then switch safely
  sudo rsvp logs app               Follow app logs (db/tunnel also work)
  sudo rsvp backup                 Create and verify a backup now
  sudo rsvp backups                List available backups
  sudo rsvp restore BACKUP.dump    Guarded restore with a safety backup first
  sudo rsvp preview                Get a temporary trycloudflare.com address
  sudo rsvp domain HOSTNAME        Attach the permanent Cloudflare domain
  sudo rsvp admin-help             Show how to reach private admin pages
EOF
    ;;
  *)
    err "Unknown command: $COMMAND"
    /usr/local/bin/rsvp help
    exit 1
    ;;
esac