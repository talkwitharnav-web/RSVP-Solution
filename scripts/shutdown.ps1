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
            Write-Ok "Stopped."
        } catch {
            Write-Warn "Could not stop process $processId -- it may have already exited."
        }
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
            Write-Warn "docker compose stop reported an error. It may already be stopped."
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
    Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
    # Docker Desktop's backend runs as several helper processes (com.docker.*)
    # that linger briefly after the main window process is killed.
    Get-Process "com.docker.*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    $stopped = Show-WaitProgress -Activity "Shutting down Docker Desktop" -MaxWaitSeconds 30 -PollSeconds 1 -CheckDone {
        -not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)
    }
    if ($stopped) {
        Write-Ok "Docker Desktop closed."
    } else {
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
    # `wsl --shutdown` itself blocks until WSL is down, so there's no
    # separate process to poll -- the progress bar here just reflects the
    # single blocking call's real elapsed time, updated as it runs.
    $wslJob = Start-Job -ScriptBlock { wsl --shutdown }
    $completed = Show-WaitProgress -Activity "Shutting down WSL" -MaxWaitSeconds 30 -PollSeconds 1 -CheckDone {
        (Get-Job -Id $wslJob.Id).State -ne "Running"
    }
    Receive-Job -Job $wslJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $wslJob -Force -ErrorAction SilentlyContinue
    if ($completed) {
        Write-Ok "WSL shut down."
    } else {
        Write-Warn "WSL shutdown did not confirm within 30 seconds. It may still be finishing in the background."
    }
}

Write-Host ""
Write-Ok "Shutdown complete."
