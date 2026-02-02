#!/bin/bash

# ============================================================================
# Generate Self-Signed SSL Certificates for Development
# Silent Auction Gallery
# ============================================================================
#
# Usage: bash scripts/generate-ssl-cert.sh
#
# This creates self-signed certificates for local development/testing.
# DO NOT use these in production - use proper certificates from a CA.
#
# Creates:
#   - ssl/key.pem  (private key)
#   - ssl/cert.pem (self-signed certificate)
#

# Create ssl directory if it doesn't exist
mkdir -p ssl

# Generate private key and self-signed certificate
# Valid for 365 days
openssl req -x509 -newkey rsa:2048 -nodes \
  -out ssl/cert.pem \
  -keyout ssl/key.pem \
  -days 365 \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo "✅ SSL certificates generated:"
echo "   Key:  ./ssl/key.pem"
echo "   Cert: ./ssl/cert.pem"
echo ""
echo "To enable HTTPS, update .env:"
echo "   HTTPS_ENABLED=true"
echo "   SSL_KEY_PATH=./ssl/key.pem"
echo "   SSL_CERT_PATH=./ssl/cert.pem"
