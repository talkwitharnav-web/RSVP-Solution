#!/usr/bin/env bash
# Thin root-level launcher. All deployment logic lives in deploy/ so there is
# one implementation to maintain, matching the Restaurant project's wrappers.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  exec bash "$SCRIPT_DIR/deploy/install-linux-mint.sh" "$@"
fi

exec sudo bash "$SCRIPT_DIR/deploy/install-linux-mint.sh" "$@"