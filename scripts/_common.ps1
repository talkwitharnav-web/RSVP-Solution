# Shared helpers for startup.ps1 / shutdown.ps1. Not meant to be run
# directly -- dot-sourced by the other scripts in this folder.

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    OK: $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    WARN: $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "    ERROR: $Message" -ForegroundColor Red }
function Write-Info { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }

# Waits for a caller-supplied check scriptblock to succeed, printing one
# plain status line every $PollSeconds (e.g. "waiting... (10s)") instead of
# a fake progress bar -- there's no way to know real percent-complete for
# something like "has Docker Desktop finished booting", so we don't pretend to.
function Wait-For {
    param(
        [string]$Label,
        [scriptblock]$CheckDone,
        [int]$MaxWaitSeconds = 60,
        [int]$PollSeconds = 2
    )
    $waited = 0
    while ($waited -lt $MaxWaitSeconds) {
        if (& $CheckDone) {
            Write-Ok $Label
            return $true
        }
        Write-Info "${Label}: still waiting... (${waited}s)"
        Start-Sleep -Seconds $PollSeconds
        $waited += $PollSeconds
    }
    if (& $CheckDone) {
        Write-Ok $Label
        return $true
    }
    return $false
}

# Locates Docker Desktop's exe without assuming a fixed install path --
# checks the standard location first, then falls back to the registry
# uninstall-info key Docker's installer writes, so a nonstandard install
# location doesn't hard-fail the whole script.
function Find-DockerDesktopExe {
    $standard = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $standard) { return $standard }

    try {
        $regPaths = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop",
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop"
        )
        foreach ($regPath in $regPaths) {
            if (Test-Path $regPath) {
                $installLoc = (Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue).InstallLocation
                if ($installLoc) {
                    $candidate = Join-Path $installLoc "Docker Desktop.exe"
                    if (Test-Path $candidate) { return $candidate }
                }
            }
        }
    } catch {
        # Registry lookup is a best-effort fallback -- fall through to $null.
    }
    return $null
}
