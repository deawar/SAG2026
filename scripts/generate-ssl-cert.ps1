#!/usr/bin/env powershell

# ============================================================================
# Generate Self-Signed SSL Certificates for Development (Windows)
# Silent Auction Gallery
# ============================================================================
#
# Usage: PowerShell -ExecutionPolicy Bypass -File scripts/generate-ssl-cert.ps1
#
# This creates self-signed certificates for local development/testing.
# DO NOT use these in production - use proper certificates from a CA.
#
# Creates:
#   - ssl/key.pem  (private key)
#   - ssl/cert.pem (self-signed certificate)
#

# Create ssl directory if it doesn't exist
if (-not (Test-Path "ssl")) {
    New-Item -ItemType Directory -Path "ssl" | Out-Null
}

# Use openssl if available (from Git Bash, WSL, or installed separately)
$opensslPath = "openssl"

try {
    # Generate private key and self-signed certificate
    # Valid for 365 days
    & $opensslPath req -x509 -newkey rsa:2048 -nodes `
      -out ssl\cert.pem `
      -keyout ssl\key.pem `
      -days 365 `
      -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

    Write-Host "✅ SSL certificates generated:" -ForegroundColor Green
    Write-Host "   Key:  ./ssl/key.pem"
    Write-Host "   Cert: ./ssl/cert.pem"
    Write-Host ""
    Write-Host "To enable HTTPS, update .env:" -ForegroundColor Yellow
    Write-Host "   HTTPS_ENABLED=true"
    Write-Host "   SSL_KEY_PATH=./ssl/key.pem"
    Write-Host "   SSL_CERT_PATH=./ssl/cert.pem"
}
catch {
    Write-Host "❌ Error: openssl not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "To generate certificates, install OpenSSL:" -ForegroundColor Yellow
    Write-Host "  - Via Git Bash (git-scm.com)"
    Write-Host "  - Via WSL (Windows Subsystem for Linux)"
    Write-Host "  - Via Chocolatey: choco install openssl"
    Write-Host "  - Via vcpkg: vcpkg install openssl"
    exit 1
}
