# RSVP app shutdown script.
#
# Run this from the repo root by typing: .\scripts\shutdown.ps1
# Stops the local dev server (if one is running on port 3001), stops the
# Postgres Docker container, quits Docker Desktop entirely, and shuts down
# WSL. Does NOT delete the Postgres data volume -- your data is still there
# next time you run startup.ps1 (Docker Desktop/WSL will just restart fresh).
#
# NOTE: quitting Docker Desktop and shutting down WSL affects your WHOLE
# machine, not just this project -- any other container or WSL-based tool
# you have running will also stop. That's intentional per user request.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "_common.ps1")

Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " RSVP app - shutdown" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta

# ---------------------------------------------------------------------------
# 1. Stop the dev server, if one is running on port 3001
# ---------------------------------------------------------------------------
Write-Step "Looking for a dev server on port 3001..."
$connections = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $pids) {
        try {
            $proc = Get-Process -Id $processId -ErrorAction Stop
            Write-Info "Stopping process $processId ($($proc.ProcessName)) listening on port 3001..."
            Stop-Process -Id $processId -Force
        } catch {
            Write-Warn "Could not stop process $processId -- it may have already exited."
        }
    }
    Start-Sleep -Seconds 1
    $stillThere = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
    if ($stillThere) {
        Write-Warn "Port 3001 still has a process listening after attempting to stop it."
        Write-Info "You may need to close it manually (e.g. the terminal it was started in)."
    } else {
        Write-Ok "Stopped."
    }
} else {
    Write-Info "No dev server found listening on port 3001. (If you started it in a terminal with Ctrl+C available, just press Ctrl+C there instead.)"
}

# ---------------------------------------------------------------------------
# 2. Stop Postgres via docker compose
# ---------------------------------------------------------------------------
Write-Step "Stopping Postgres (docker compose stop)..."
$composeFile = Join-Path $RepoRoot "docker-compose.yml"
if (-not (Test-Path $composeFile)) {
    Write-Warn "docker-compose.yml not found at $composeFile -- skipping."
} else {
    Push-Location $RepoRoot
    try {
        docker compose stop
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Postgres container stopped. Your data is preserved for next time."
        } else {
            Write-Warn "docker compose stop reported an error. It may already be stopped, or Docker Desktop may already be closed."
        }
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 3. Quit Docker Desktop entirely
# ---------------------------------------------------------------------------
Write-Step "Quitting Docker Desktop..."
$dockerDesktopProc = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerDesktopProc) {
    Write-Info "Docker Desktop does not appear to be running. Skipping."
} else {
    # `docker desktop stop` (the Docker Desktop CLI plugin, not Stop-Process)
    # asks Docker Desktop to shut down its own backend gracefully -- it tears
    # down its WSL-hosted engine/data distros itself before exiting, which is
    # what actually lets `wsl --shutdown` below finish cleanly. Previously
    # this used Stop-Process -Force (a hard kill, equivalent to SIGKILL),
    # which skipped that teardown entirely -- the backend never got a chance
    # to tell WSL it was done, so vmmemWSL kept running in Task Manager even
    # after this script finished. No -Force flag here on purpose: that flag
    # exists specifically to skip the graceful path, which is the opposite of
    # what this step is for. Synchronous by default (no -d/--detach), so this
    # blocks until Docker Desktop confirms it's actually stopped rather than
    # racing the next step.
    $dockerDesktopCli = Get-Command "docker" -ErrorAction SilentlyContinue
    if ($dockerDesktopCli) {
        docker desktop stop --timeout 30
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Docker Desktop stopped gracefully."
        } else {
            Write-Warn "docker desktop stop reported an error (exit code $LASTEXITCODE). Falling back to a forceful stop."
            Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
            Get-Process "com.docker.*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Warn "docker CLI not found -- cannot use the graceful 'docker desktop stop' path. Falling back to a forceful stop."
        Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
        Get-Process "com.docker.*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    $stopped = Wait-For -Label "Docker Desktop closed" -MaxWaitSeconds 30 -PollSeconds 2 -CheckDone {
        -not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)
    }
    if (-not $stopped) {
        Write-Warn "Docker Desktop did not confirm closed within 30 seconds. It may still be shutting down in the background."
    }
}

# ---------------------------------------------------------------------------
# 4. Shut down WSL
# ---------------------------------------------------------------------------
Write-Step "Shutting down WSL..."
$wslCmd = Get-Command wsl -ErrorAction SilentlyContinue
if (-not $wslCmd) {
    Write-Info "wsl command not found on this machine. Skipping."
} else {
    # wsl --shutdown blocks until WSL is actually down, so just run it
    # directly and check its exit code -- no need for a background job.
    wsl --shutdown
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "WSL shut down."
    } else {
        Write-Warn "wsl --shutdown reported an error (exit code $LASTEXITCODE). It may already be stopped."
    }
}

Write-Host ""
Write-Ok "Shutdown complete."
