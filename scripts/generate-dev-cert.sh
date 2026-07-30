#!/usr/bin/env bash
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
# Run from the repo root: ./scripts/generate-dev-cert.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

CERT_DIR="$REPO_ROOT/certs"
CERT_FILE="$CERT_DIR/dev-proxy-cert.pem"
KEY_FILE="$CERT_DIR/dev-proxy-key.pem"

step "Checking for openssl..."
if ! command -v openssl >/dev/null 2>&1; then
    err "openssl is not on PATH (Git for Windows ships one under mingw64/usr bin)."
    exit 1
fi
ok "openssl found: $(openssl version)"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    warn "Cert already exists at $CERT_FILE -- leaving it in place."
    info "Delete both files under certs/ first if you want a fresh one."
    exit 0
fi

step "Generating a self-signed cert for localhost/127.0.0.1..."
# Git Bash (MSYS2) rewrites any argument that looks like a leading "/path"
# into a Windows path before exec'ing openssl.exe -- e.g. "/CN=localhost"
# silently becomes "C:/Users/.../Git/CN=localhost", which openssl then
# rejects as a malformed subject name. Doubling the leading slash ("//CN=...")
# is MSYS2's own documented escape for "don't treat this as a path" and
# openssl accepts the doubled slash as if it were a single one.
openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 365 \
    -subj "//CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"

if [ $? -ne 0 ]; then
    err "openssl failed to generate the certificate."
    exit 1
fi

ok "Certificate written to $CERT_FILE"
ok "Private key written to $KEY_FILE"
info "Both are gitignored (*.pem) -- never commit these."
info "Browsers will show an untrusted-certificate warning for this self-signed"
info "pair; that's expected for local testing. curl needs -k / --insecure."
