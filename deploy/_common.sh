#!/usr/bin/env bash

if [ -t 1 ]; then
  C_CYAN='\033[0;36m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'
  C_RED='\033[0;31m'; C_GRAY='\033[0;90m'; C_MAGENTA='\033[0;35m'; C_RESET='\033[0m'
else
  C_CYAN=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_GRAY=''; C_MAGENTA=''; C_RESET=''
fi

banner() {
  printf '%s=========================================%s\n' "$C_MAGENTA" "$C_RESET"
  printf '%s %s%s\n' "$C_MAGENTA" "$1" "$C_RESET"
  printf '%s=========================================%s\n' "$C_MAGENTA" "$C_RESET"
}

step() { printf "\n${C_CYAN}==> %s${C_RESET}\n" "$1"; }
ok()   { printf "    ${C_GREEN}[OK]${C_RESET} %s\n" "$1"; }
warn() { printf "    ${C_YELLOW}[!]${C_RESET} %s\n" "$1"; }
err()  { printf "    ${C_RED}[FAIL]${C_RESET} %s\n" "$1" >&2; }
info() { printf "    ${C_GRAY}%s${C_RESET}\n" "$1"; }

die() {
  err "$1"
  exit 1
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "Run this command with sudo."
  fi
}

confirm() {
  local prompt="$1"
  local default="${2:-no}"
  local suffix="[y/N]"
  [ "$default" = "yes" ] && suffix="[Y/n]"

  local answer
  read -r -p "$prompt $suffix " answer </dev/tty
  answer="${answer:-$default}"
  case "$answer" in
    y|Y|yes|YES|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

random_secret() {
  openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'
}

systemd_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

read_simple_env() {
  local file="$1"
  local key="$2"
  local value
  value="$(grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2-)"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"
  local count=0
  while [ "$count" -lt "$attempts" ]; do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    count=$((count + 1))
  done
  return 1
}

# These constants are consumed by the scripts that source this helper.
# shellcheck disable=SC2034
APP_DIR="/opt/rsvp/app"
# shellcheck disable=SC2034
APP_ENV="/etc/rsvp/app.env"
# shellcheck disable=SC2034
POSTGRES_ENV="/etc/rsvp/postgres.env"
# shellcheck disable=SC2034
COMPOSE_FILE="$APP_DIR/deploy/docker-compose.production.yml"
# shellcheck disable=SC2034
POSTGRES_CONTAINER="rsvp-postgres-production"
# shellcheck disable=SC2034
BACKUP_DIR="/var/backups/rsvp"