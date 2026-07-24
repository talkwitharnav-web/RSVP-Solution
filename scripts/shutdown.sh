#!/usr/bin/env bash
# RSVP app shutdown script.
#
# Run this from the repo root by typing: ./scripts/shutdown.sh
# Stops the local dev server (if one is running on port 3001), stops the
# Postgres Docker container, quits Docker Desktop entirely, and shuts down
# WSL. Does NOT delete the Postgres data volume -- your data is still there
# next time you run startup.sh (Docker Desktop/WSL will just restart fresh).
#
# NOTE: quitting Docker Desktop and shutting down WSL affects your WHOLE
# machine, not just this project -- any other container or WSL-based tool
# you have running will also stop. That's intentional per user request.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

printf "\033[35m=========================================\033[0m\n"
printf "\033[35m RSVP app - shutdown\033[0m\n"
printf "\033[35m=========================================\033[0m\n"

# ---------------------------------------------------------------------------
# 1. Stop the dev server, if one is running on port 3001
# ---------------------------------------------------------------------------
step "Looking for a dev server on port 3001..."

# Uses PowerShell's Get-NetTCPConnection for the actual PID lookup -- it's a
# structured object, unlike netstat's plain-text table, whose column layout
# is not reliable enough to parse with a fixed awk column index.
port_3001_pids() {
    powershell -NoProfile -Command "
        (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique) -join ' '
    " 2>/dev/null | tr -d '\r'
}

pids="$(port_3001_pids)"

if [ -n "$pids" ]; then
    for pid in $pids; do
        info "Stopping process $pid listening on port 3001..."
        taskkill //F //PID "$pid" >/dev/null 2>&1
    done
    sleep 1
    remaining="$(port_3001_pids)"
    if [ -z "$remaining" ]; then
        ok "Stopped."
    else
        warn "Port 3001 still has a process listening ($remaining) after attempting to stop it."
        info "You may need to close it manually (e.g. the terminal it was started in)."
    fi
else
    info "No dev server found listening on port 3001. (If you started it in a terminal with Ctrl+C available, just press Ctrl+C there instead.)"
fi

# ---------------------------------------------------------------------------
# 2. Stop Postgres via docker compose
# ---------------------------------------------------------------------------
step "Stopping Postgres (docker compose stop)..."
if [ ! -f "$REPO_ROOT/docker-compose.yml" ]; then
    warn "docker-compose.yml not found -- skipping."
else
    if (cd "$REPO_ROOT" && docker compose stop); then
        ok "Postgres container stopped. Your data is preserved for next time."
    else
        warn "docker compose stop reported an error. It may already be stopped, or Docker Desktop may already be closed."
    fi
fi

# ---------------------------------------------------------------------------
# 3. Quit Docker Desktop entirely
# ---------------------------------------------------------------------------
step "Quitting Docker Desktop..."
docker_desktop_running() {
    tasklist //FI "IMAGENAME eq Docker Desktop.exe" 2>/dev/null | grep -qi "Docker Desktop.exe"
}
if ! command -v tasklist >/dev/null 2>&1; then
    warn "tasklist not available -- cannot check/stop Docker Desktop from this shell. Skipping."
elif docker_desktop_running; then
    taskkill //F //IM "Docker Desktop.exe" >/dev/null 2>&1 || true
    # Docker Desktop's backend runs as several helper processes
    # (com.docker.*.exe) that linger briefly after the main window closes.
    taskkill //F //IM "com.docker.backend.exe" >/dev/null 2>&1 || true

    docker_desktop_stopped() { ! docker_desktop_running; }
    if wait_for "Docker Desktop closed" 30 2 docker_desktop_stopped; then
        :
    else
        warn "Docker Desktop did not confirm closed within 30 seconds. It may still be shutting down in the background."
    fi
else
    info "Docker Desktop does not appear to be running. Skipping."
fi

# ---------------------------------------------------------------------------
# 4. Shut down WSL
# ---------------------------------------------------------------------------
step "Shutting down WSL..."
if command -v wsl.exe >/dev/null 2>&1 || command -v wsl >/dev/null 2>&1; then
    WSL_BIN="$(command -v wsl.exe || command -v wsl)"
    if "$WSL_BIN" --shutdown; then
        ok "WSL shut down."
    else
        warn "wsl --shutdown reported an error. It may already be stopped."
    fi
else
    info "wsl command not found on this machine. Skipping."
fi

echo
ok "Shutdown complete."
