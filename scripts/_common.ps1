# Shared helpers for startup.ps1 / shutdown.ps1. Not meant to be run
# directly -- dot-sourced by the other scripts in this folder.

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    OK: $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    WARN: $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "    ERROR: $Message" -ForegroundColor Red }
function Write-Info { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }

# Renders a real progress bar driven by a caller-supplied "are we done yet"
# check -- not a fixed-time animation. Polls $CheckDone every $PollSeconds,
# advancing the bar toward 90% while waiting and snapping to 100% the moment
# $CheckDone returns $true (or when $MaxWaitSeconds is hit, whichever first).
function Show-WaitProgress {
    param(
        [string]$Activity,
        [scriptblock]$CheckDone,
        [int]$MaxWaitSeconds = 60,
        [int]$PollSeconds = 2
    )
    $waited = 0
    $done = $false
    while ($waited -lt $MaxWaitSeconds) {
        $done = & $CheckDone
        if ($done) { break }
        # Cap the displayed percent at 90 until we actually confirm done,
        # so the bar never lies by claiming 100% before it's true.
        $percent = [math]::Min(90, [math]::Floor(($waited / $MaxWaitSeconds) * 100))
        Write-Progress -Activity $Activity -Status "$percent% (waiting...)" -PercentComplete $percent
        Start-Sleep -Seconds $PollSeconds
        $waited += $PollSeconds
    }
    if ($done) {
        Write-Progress -Activity $Activity -Status "100%" -PercentComplete 100
        Start-Sleep -Milliseconds 300
    }
    Write-Progress -Activity $Activity -Completed
    return $done
}
