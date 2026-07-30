#!/usr/bin/env bash
# RSVP app startup script.
#
# Run this from the repo root by typing: ./scripts/startup.sh
# It never hardcodes a machine-specific path -- everything is resolved
# relative to this script's own location, so it works the same on any
# machine the repo is cloned/copied to.
#
# What it does, in order:
#   1. Check Node.js is installed.
#   2. Check npm is installed.
#   3. Check Docker is installed.
#   4. Check Docker Desktop is running -- if not, LAUNCH it and wait for the
#      engine to come up (this also brings up WSL, since Docker Desktop's
#      backend runs on the WSL2 engine -- no separate WSL start needed).
#   5. Check/create .env.local (copies from .env.local.example if missing).
#   6. Check/install npm dependencies.
#   7. Start the Postgres container via docker compose.
#   8. Start the dev server (npm run dev).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

printf "\033[35m=========================================\033[0m\n"
printf "\033[35m RSVP app - startup dependency check\033[0m\n"
printf "\033[35m=========================================\033[0m\n"
info "Repo root: $REPO_ROOT"

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
step "Checking for Node.js..."
if ! command -v node >/dev/null 2>&1; then
    err "Node.js is not installed or not on PATH."
    info "Install it from https://nodejs.org (LTS version) and re-run this script."
    exit 1
fi
ok "Node.js found: $(node --version)"

# ---------------------------------------------------------------------------
# 2. npm
# ---------------------------------------------------------------------------
step "Checking for npm..."
if ! command -v npm >/dev/null 2>&1; then
    err "npm is not installed or not on PATH (it normally ships with Node.js)."
    info "Reinstall Node.js from https://nodejs.org, then re-run this script."
    exit 1
fi
ok "npm found: v$(npm --version)"

# ---------------------------------------------------------------------------
# 3. Docker installed
# ---------------------------------------------------------------------------
step "Checking for Docker..."
if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed or not on PATH."
    info "This app needs Docker Desktop to run its Postgres database locally."
    info "Download and install it from https://www.docker.com/products/docker-desktop/"
    info "Then start Docker Desktop once (it needs to be running, not just installed) and re-run this script."
    exit 1
fi
ok "Docker found: $(docker --version)"

# ---------------------------------------------------------------------------
# 4. Docker actually running (auto-launch Docker Desktop if not)
# ---------------------------------------------------------------------------
step "Checking Docker is running..."
docker_ready() { docker info >/dev/null 2>&1; }

if docker_ready; then
    ok "Docker is already running."
else
    info "Docker is not running -- looking for Docker Desktop..."

    DOCKER_DESKTOP_EXE="/c/Program Files/Docker/Docker/Docker Desktop.exe"
    if [ ! -f "$DOCKER_DESKTOP_EXE" ]; then
        # Fallback: ask PowerShell to check the registry for a nonstandard
        # install location, rather than hard-failing on the one fixed path.
        found="$(powershell -NoProfile -Command '
            $p = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
            foreach ($k in @(
                "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop",
                "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop"
            )) {
                if (Test-Path $k) {
                    $loc = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).InstallLocation
                    if ($loc) {
                        $candidate = Join-Path $loc "Docker Desktop.exe"
                        if (Test-Path $candidate) { Write-Output $candidate; exit }
                    }
                }
            }
        ' 2>/dev/null | tr -d '\r')"
        if [ -n "$found" ]; then
            DOCKER_DESKTOP_EXE="$found"
        fi
    fi

    if [ ! -f "$DOCKER_DESKTOP_EXE" ]; then
        err "Docker is installed but Docker Desktop.exe could not be found (checked the standard path and the registry)."
        info "Start Docker Desktop yourself, then re-run this script."
        exit 1
    fi

    # Launched detached so this script doesn't block on the GUI process.
    "$DOCKER_DESKTOP_EXE" >/dev/null 2>&1 &
    disown 2>/dev/null || true

    # Cold start (including its WSL2 backend) can genuinely take 60s+ the
    # first time; 90s gives real headroom without hanging forever if
    # something's actually wrong.
    if wait_for "Docker Desktop is up" 90 3 docker_ready; then
        :
    else
        err "Docker Desktop did not become ready within 90 seconds."
        info "Open Docker Desktop yourself and check for an error dialog, then re-run this script."
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# 5. .env.local
# ---------------------------------------------------------------------------
step "Checking .env.local..."
if [ ! -f "$REPO_ROOT/.env.local" ]; then
    if [ ! -f "$REPO_ROOT/.env.local.example" ]; then
        err ".env.local.example not found -- cannot create .env.local."
        exit 1
    fi
    cp "$REPO_ROOT/.env.local.example" "$REPO_ROOT/.env.local"
    ok "Created .env.local from .env.local.example."
else
    ok ".env.local already exists."
fi
if ! node "$SCRIPT_DIR/ensure-session-secret.mjs" "$REPO_ROOT/.env.local"; then
    err "Could not configure SESSION_SECRET in .env.local."
    exit 1
fi

# ---------------------------------------------------------------------------
# 6. npm dependencies
# ---------------------------------------------------------------------------
step "Checking npm dependencies..."
cd "$REPO_ROOT"
if [ ! -d "$REPO_ROOT/node_modules" ]; then
    info "node_modules missing -- installing dependencies (this may take a minute)..."
    if [ -f "$REPO_ROOT/package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    install_status=$?
    if [ "$install_status" -ne 0 ]; then
        err "npm install failed (exit code $install_status). See output above."
        info "Common fixes: check your internet connection, or delete node_modules and package-lock.json and try again."
        exit 1
    fi
    ok "Dependencies installed."
else
    ok "node_modules already present. (Run 'npm install' yourself if package.json changed.)"
fi

# ---------------------------------------------------------------------------
# 7. Start Postgres via docker compose
# ---------------------------------------------------------------------------
step "Starting Postgres (docker compose up -d)..."
if [ ! -f "$REPO_ROOT/docker-compose.yml" ]; then
    err "docker-compose.yml not found."
    exit 1
fi
if ! (cd "$REPO_ROOT" && docker compose up -d); then
    err "docker compose up failed. See output above."
    info "If Docker Desktop just started, wait a few seconds and try running this script again."
    exit 1
fi
ok "Postgres container is up (or was already running)."

postgres_ready() { docker exec rsvp-postgres-1 pg_isready -U postgres >/dev/null 2>&1; }
if wait_for "Postgres is ready" 30 2 postgres_ready; then
    :
else
    warn "Postgres did not report ready within 30 seconds -- it may still be starting."
    info "Continuing anyway. If the app can't reach the database, run 'docker compose logs postgres' to check."
fi

# ---------------------------------------------------------------------------
# 8. Start the dev server
# ---------------------------------------------------------------------------
step "All checks passed. Starting the dev server..."
info "Running: npm run dev  (from $REPO_ROOT)"
info "Press Ctrl+C to stop the server. Run scripts/shutdown.sh afterward to also stop Postgres."
echo

cd "$REPO_ROOT"
npm run dev
