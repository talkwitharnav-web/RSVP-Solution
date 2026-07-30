# Generates a local self-signed TLS certificate/key pair for testing
# scripts/tls-proxy.mjs against a real HTTPS handshake.
#
# This is NOT a certificate a browser or real client will trust by default
# (self-signed) and is NOT suitable for a real deployment -- it exists only
# to let this dev machine verify the production TLS/HSTS/secure-cookie/
# trusted-proxy chain end-to-end without a real domain or CA. A real
# deployment must replace certs/dev-proxy-cert.pem and dev-proxy-key.pem
# with a certificate issued by a real CA (e.g. Let's Encrypt) for the real
# domain, and should not use this script at all.
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/generate-dev-cert.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
. "$ScriptDir\_common.ps1"

$CertDir = Join-Path $RepoRoot "certs"
$CertFile = Join-Path $CertDir "dev-proxy-cert.pem"
$KeyFile = Join-Path $CertDir "dev-proxy-key.pem"

Write-Step "Checking for openssl..."
$opensslCmd = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $opensslCmd) {
    Write-Err "openssl is not on PATH (Git for Windows ships one under mingw64/usr bin)."
    exit 1
}
Write-Ok "openssl found: $(& openssl version)"

if (-not (Test-Path $CertDir)) {
    New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
}

if ((Test-Path $CertFile) -and (Test-Path $KeyFile)) {
    Write-Warn "Cert already exists at $CertFile -- leaving it in place."
    Write-Info "Delete both files under certs/ first if you want a fresh one."
    exit 0
}

Write-Step "Generating a self-signed cert for localhost/127.0.0.1..."
& openssl req -x509 -nodes -newkey rsa:2048 `
    -keyout $KeyFile `
    -out $CertFile `
    -days 365 `
    -subj "/CN=localhost" `
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"

if ($LASTEXITCODE -ne 0) {
    Write-Err "openssl failed to generate the certificate."
    exit 1
}

Write-Ok "Certificate written to $CertFile"
Write-Ok "Private key written to $KeyFile"
Write-Info "Both are gitignored (*.pem) -- never commit these."
Write-Info "Browsers will show an untrusted-certificate warning for this self-signed"
Write-Info "pair; that's expected for local testing. curl needs -k / --insecure."
