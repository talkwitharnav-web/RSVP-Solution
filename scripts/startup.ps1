# RSVP app startup script.
#
# Run this from the repo root by typing: .\scripts\startup.ps1
# It never hardcodes a machine-specific path -- everything is resolved
# relative to this script's own location, so it works the same on any
# machine the repo is cloned/copied to.
#
# What it does, in order, being verbose about every step:
#   1. Check Node.js is installed (and print the version).
#   2. Check npm is installed.
#   3. Check Docker Desktop is installed.
#   4. Check Docker Desktop is running -- if not, LAUNCH it and wait for the
#      engine to come up (this also brings up WSL, since Docker Desktop's
#      backend runs on the WSL2 engine -- no separate WSL start needed).
#   5. Check/create .env.local (copies from .env.local.example if missing).
#   6. Check/install npm dependencies (npm ci if a lockfile exists and
#      node_modules is missing/stale, else npm install).
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
$nodeVersion = (node --version).Trim()
Write-Ok "Node.js found: $nodeVersion"

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
$npmVersion = (npm --version).Trim()
Write-Ok "npm found: v$npmVersion"

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
$dockerVersion = (docker --version).Trim()
Write-Ok "Docker found: $dockerVersion"

# ---------------------------------------------------------------------------
# 4. Docker Desktop actually running (auto-launch it if not)
# ---------------------------------------------------------------------------
Write-Step "Checking Docker Desktop is running..."
$dockerRunning = $false
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch {
    $dockerRunning = $false
}

if ($dockerRunning) {
    Write-Ok "Docker Desktop is already running."
} else {
    Write-Info "Docker Desktop is not running -- launching it..."
    $dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerDesktopExe)) {
        Write-Err "Docker is installed but Docker Desktop.exe was not found at the expected path ($dockerDesktopExe)."
        Write-Info "Start Docker Desktop yourself (it can take 10-30s to finish starting up), then re-run this script."
        exit 1
    }
    Start-Process $dockerDesktopExe | Out-Null

    # Cold start (including its WSL2 backend) can genuinely take 60s+ the
    # first time; 90s gives real headroom without hanging forever if
    # something's actually wrong.
    $becameReady = Show-WaitProgress -Activity "Starting Docker Desktop" -MaxWaitSeconds 90 -PollSeconds 2 -CheckDone {
        try {
            docker info 2>&1 | Out-Null
            $LASTEXITCODE -eq 0
        } catch { $false }
    }
    if ($becameReady) {
        Write-Ok "Docker Desktop is up."
    } else {
        Write-Err "Docker Desktop did not report ready within 90 seconds."
        Write-Info "Open Docker Desktop and check for an error dialog, then re-run this script."
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
        if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed. See output above."; exit 1 }
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
    if ($LASTEXITCODE -ne 0) { Write-Err "docker compose up failed. See output above."; exit 1 }
} finally {
    Pop-Location
}
Write-Ok "Postgres container is up (or was already running)."

Write-Info "Waiting for Postgres to accept connections..."
$maxWaitSeconds = 30
$waited = 0
$ready = $false
while ($waited -lt $maxWaitSeconds) {
    docker exec rsvp-postgres-1 pg_isready -U postgres 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
    $waited += 2
}
if ($ready) {
    Write-Ok "Postgres is ready."
} else {
    Write-Warn "Postgres did not report ready within $maxWaitSeconds seconds -- it may still be starting. Continuing anyway."
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
