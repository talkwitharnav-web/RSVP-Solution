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
if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:3001 2>/dev/null || true)
elif command -v netstat >/dev/null 2>&1; then
    # Git Bash on Windows: parse netstat output for the PID column.
    pids=$(netstat -ano 2>/dev/null | grep ':3001 ' | grep LISTENING | awk '{print $NF}' | sort -u || true)
else
    pids=""
fi

if [ -n "$pids" ]; then
    for pid in $pids; do
        info "Stopping process $pid listening on port 3001..."
        if command -v taskkill >/dev/null 2>&1; then
            taskkill //F //PID "$pid" >/dev/null 2>&1 && ok "Stopped." || warn "Could not stop process $pid -- it may have already exited."
        else
            kill -9 "$pid" 2>/dev/null && ok "Stopped." || warn "Could not stop process $pid -- it may have already exited."
        fi
    done
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
        warn "docker compose stop reported an error. It may already be stopped."
    fi
fi

# ---------------------------------------------------------------------------
# 3. Quit Docker Desktop entirely
# ---------------------------------------------------------------------------
step "Quitting Docker Desktop..."
docker_desktop_running() {
    tasklist //FI "IMAGENAME eq Docker Desktop.exe" 2>/dev/null | grep -qi "Docker Desktop.exe"
}
if command -v tasklist >/dev/null 2>&1 && docker_desktop_running; then
    taskkill //F //IM "Docker Desktop.exe" >/dev/null 2>&1 || true
    # Docker Desktop's backend runs as several helper processes
    # (com.docker.*.exe) that linger briefly after the main window closes.
    taskkill //F //IM "com.docker.backend.exe" >/dev/null 2>&1 || true

    docker_desktop_stopped() { ! docker_desktop_running; }
    if wait_progress "Shutting down Docker Desktop" 30 1 docker_desktop_stopped; then
        ok "Docker Desktop closed."
    else
        warn "Docker Desktop did not confirm closed within 30 seconds. It may still be shutting down in the background."
    fi
elif command -v tasklist >/dev/null 2>&1; then
    info "Docker Desktop does not appear to be running. Skipping."
else
    warn "tasklist not available -- cannot check/stop Docker Desktop from this shell. Skipping."
fi

# ---------------------------------------------------------------------------
# 4. Shut down WSL
# ---------------------------------------------------------------------------
step "Shutting down WSL..."
if command -v wsl.exe >/dev/null 2>&1 || command -v wsl >/dev/null 2>&1; then
    WSL_BIN="$(command -v wsl.exe || command -v wsl)"
    "$WSL_BIN" --shutdown &
    wsl_pid=$!
    wsl_done() { ! kill -0 "$wsl_pid" 2>/dev/null; }
    if wait_progress "Shutting down WSL" 30 1 wsl_done; then
        wait "$wsl_pid" 2>/dev/null
        ok "WSL shut down."
    else
        warn "WSL shutdown did not confirm within 30 seconds. It may still be finishing in the background."
    fi
else
    info "wsl command not found on this machine. Skipping."
fi

echo
ok "Shutdown complete."
