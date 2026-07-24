# RSVP app startup script.
#
# Run this from the repo root by typing: .\scripts\startup.ps1
# It never hardcodes a machine-specific path -- everything is resolved
# relative to this script's own location, so it works the same on any
# machine the repo is cloned/copied to.
#
# What it does, in order:
#   1. Check Node.js is installed.
#   2. Check npm is installed.
#   3. Check Docker Desktop is installed.
#   4. Check Docker Desktop is running -- if not, LAUNCH it and wait for the
#      engine to come up (this also brings up WSL, since Docker Desktop's
#      backend runs on the WSL2 engine -- no separate WSL start needed).
#   5. Check/create .env.local (copies from .env.local.example if missing).
#   6. Check/install npm dependencies.
#   7. Start the Postgres container via docker compose.
#   8. Start the dev server (npm run dev).

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "_common.ps1")

Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " RSVP app - startup dependency check" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Info "Repo root: $RepoRoot"

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
Write-Step "Checking for Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "Node.js is not installed or not on PATH."
    Write-Info "Install it from https://nodejs.org (LTS version) and re-run this script."
    exit 1
}
Write-Ok "Node.js found: $((node --version).Trim())"

# ---------------------------------------------------------------------------
# 2. npm
# ---------------------------------------------------------------------------
Write-Step "Checking for npm..."
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Err "npm is not installed or not on PATH (it normally ships with Node.js)."
    Write-Info "Reinstall Node.js from https://nodejs.org, then re-run this script."
    exit 1
}
Write-Ok "npm found: v$((npm --version).Trim())"

# ---------------------------------------------------------------------------
# 3. Docker Desktop installed
# ---------------------------------------------------------------------------
Write-Step "Checking for Docker..."
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Err "Docker is not installed or not on PATH."
    Write-Info "This app needs Docker Desktop to run its Postgres database locally."
    Write-Info "Download and install it from https://www.docker.com/products/docker-desktop/"
    Write-Info "Then start Docker Desktop once (it needs to be running, not just installed) and re-run this script."
    exit 1
}
Write-Ok "Docker found: $((docker --version).Trim())"

# ---------------------------------------------------------------------------
# 4. Docker Desktop actually running (auto-launch it if not)
# ---------------------------------------------------------------------------
Write-Step "Checking Docker Desktop is running..."
function Test-DockerReady {
    try {
        docker info 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

if (Test-DockerReady) {
    Write-Ok "Docker Desktop is already running."
} else {
    Write-Info "Docker Desktop is not running -- looking for it..."
    $dockerDesktopExe = Find-DockerDesktopExe
    if (-not $dockerDesktopExe) {
        Write-Err "Docker is installed but Docker Desktop.exe could not be found (checked the standard path and the registry)."
        Write-Info "Start Docker Desktop yourself, then re-run this script."
        exit 1
    }

    Write-Info "Launching $dockerDesktopExe ..."
    Start-Process $dockerDesktopExe | Out-Null

    # Cold start (including its WSL2 backend) can genuinely take 60s+ the
    # first time; 90s gives real headroom without hanging forever if
    # something's actually wrong.
    $becameReady = Wait-For -Label "Docker Desktop is up" -MaxWaitSeconds 90 -PollSeconds 3 -CheckDone { Test-DockerReady }
    if (-not $becameReady) {
        Write-Err "Docker Desktop did not become ready within 90 seconds."
        Write-Info "Open Docker Desktop yourself and check for an error dialog, then re-run this script."
        exit 1
    }
}

# ---------------------------------------------------------------------------
# 5. .env.local
# ---------------------------------------------------------------------------
Write-Step "Checking .env.local..."
$envLocal = Join-Path $RepoRoot ".env.local"
$envExample = Join-Path $RepoRoot ".env.local.example"
if (-not (Test-Path $envLocal)) {
    if (-not (Test-Path $envExample)) {
        Write-Err ".env.local.example not found at $envExample -- cannot create .env.local."
        exit 1
    }
    Copy-Item $envExample $envLocal
    Write-Ok "Created .env.local from .env.local.example."
} else {
    Write-Ok ".env.local already exists."
}

# ---------------------------------------------------------------------------
# 6. npm dependencies
# ---------------------------------------------------------------------------
Write-Step "Checking npm dependencies..."
$nodeModules = Join-Path $RepoRoot "node_modules"
$lockFile = Join-Path $RepoRoot "package-lock.json"
Push-Location $RepoRoot
try {
    if (-not (Test-Path $nodeModules)) {
        Write-Info "node_modules missing -- installing dependencies (this may take a minute)..."
        if (Test-Path $lockFile) { npm ci } else { npm install }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "npm install failed (exit code $LASTEXITCODE). See output above."
            Write-Info "Common fixes: check your internet connection, or delete node_modules and package-lock.json and try again."
            exit 1
        }
        Write-Ok "Dependencies installed."
    } else {
        Write-Ok "node_modules already present. (Run 'npm install' yourself if package.json changed.)"
    }
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 7. Start Postgres via docker compose
# ---------------------------------------------------------------------------
Write-Step "Starting Postgres (docker compose up -d)..."
$composeFile = Join-Path $RepoRoot "docker-compose.yml"
if (-not (Test-Path $composeFile)) {
    Write-Err "docker-compose.yml not found at $composeFile"
    exit 1
}
Push-Location $RepoRoot
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Err "docker compose up failed. See output above."
        Write-Info "If Docker Desktop just started, wait a few seconds and try running this script again."
        exit 1
    }
} finally {
    Pop-Location
}
Write-Ok "Postgres container is up (or was already running)."

function Test-PostgresReady {
    docker exec rsvp-postgres-1 pg_isready -U postgres 2>&1 | Out-Null
    return $LASTEXITCODE -eq 0
}
$postgresReady = Wait-For -Label "Postgres is ready" -MaxWaitSeconds 30 -PollSeconds 2 -CheckDone { Test-PostgresReady }
if (-not $postgresReady) {
    Write-Warn "Postgres did not report ready within 30 seconds -- it may still be starting."
    Write-Info "Continuing anyway. If the app can't reach the database, run 'docker compose logs postgres' to check."
}

# ---------------------------------------------------------------------------
# 8. Start the dev server
# ---------------------------------------------------------------------------
Write-Step "All checks passed. Starting the dev server..."
Write-Info "Running: npm run dev  (from $RepoRoot)"
Write-Info "Press Ctrl+C to stop the server. Run scripts\shutdown.ps1 afterward to also stop Postgres."
Write-Host ""

Push-Location $RepoRoot
try {
    npm run dev
} finally {
    Pop-Location
}
