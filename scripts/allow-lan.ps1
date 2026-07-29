# Opens port 3001 to the local network so phones/tablets on the same Wi-Fi can
# reach the RSVP app. Must be run from an ELEVATED PowerShell (Windows will not
# let a normal shell touch firewall rules).
#
# The app itself already listens on every interface (server.js binds 0.0.0.0);
# Windows Firewall is what blocks the inbound connection, which is why the app
# works on this machine but not from a phone.
#
# Admin surfaces stay localhost-only regardless of this rule -- that gate lives
# in src/proxy.ts + requireAdmin() and is enforced per-request by IP, not by
# the firewall. See SYSTEM_MEMORY.md's "Localhost-only admin gate".

$ErrorActionPreference = "Stop"

$RuleName = "RSVP Dev Server (port 3001)"
$Port = 3001

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host ""
  Write-Host "  This script needs to run as Administrator." -ForegroundColor Red
  Write-Host ""
  Write-Host "  Right-click PowerShell -> 'Run as administrator', then:" -ForegroundColor Yellow
  Write-Host "    cd '$PSScriptRoot'"
  Write-Host "    .\allow-lan.ps1"
  Write-Host ""
  exit 1
}

Write-Host ""
Write-Host "  RSVP - allow LAN access on port $Port" -ForegroundColor Cyan
Write-Host "  ----------------------------------------"

# --- 1. Firewall rule -------------------------------------------------------
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "  [=] Firewall rule already exists - refreshing it."
  Remove-NetFirewallRule -DisplayName $RuleName
}

# Scoped to LocalSubnet: devices on your own network can connect, anything
# outside it cannot, even if this machine is ever exposed directly.
# Applied to Private AND Public because Windows currently classifies this
# Wi-Fi as Public, and a Private-only rule would silently never match.
New-NetFirewallRule `
  -DisplayName $RuleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -Profile Private, Public `
  -RemoteAddress LocalSubnet `
  -Description "Lets other devices on the same local network reach the RSVP dev server. Admin pages remain localhost-only." | Out-Null

Write-Host "  [+] Firewall rule created (TCP $Port inbound, local subnet only)." -ForegroundColor Green

# --- 2. Report the URL to use ----------------------------------------------
$lan = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.InterfaceAlias -notlike "*WSL*" -and
    $_.InterfaceAlias -notlike "*Default Switch*" -and
    $_.InterfaceAlias -notlike "*Bluetooth*"
  } |
  Select-Object -First 1

Write-Host ""
if ($lan) {
  Write-Host "  Open this on your phone (same Wi-Fi):" -ForegroundColor Cyan
  Write-Host "    http://$($lan.IPAddress):$Port/sender/landing" -ForegroundColor White
} else {
  Write-Host "  Could not determine a LAN IP - check you're connected to Wi-Fi." -ForegroundColor Yellow
}

# --- 3. Network category note ----------------------------------------------
$profileInfo = Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -eq $lan.InterfaceAlias }
if ($profileInfo -and $profileInfo.NetworkCategory -eq "Public") {
  Write-Host ""
  Write-Host "  Note: '$($profileInfo.Name)' is classified as a Public network." -ForegroundColor Yellow
  Write-Host "  The rule above covers that, so this will work as-is. If you'd" -ForegroundColor Yellow
  Write-Host "  rather mark your home Wi-Fi as Private (normal for a home network):" -ForegroundColor Yellow
  Write-Host "    Set-NetConnectionProfile -InterfaceAlias '$($profileInfo.InterfaceAlias)' -NetworkCategory Private"
}

Write-Host ""
Write-Host "  Admin stays localhost-only - / and /admin/* will 404 from any" -ForegroundColor DarkGray
Write-Host "  other device, by design. Use this machine for those." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  To undo later:  Remove-NetFirewallRule -DisplayName '$RuleName'" -ForegroundColor DarkGray
Write-Host ""
