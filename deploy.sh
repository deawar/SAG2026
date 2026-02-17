#!/bin/bash

# Silent Auction Gallery - Deployment Script
# Pulls latest code, rebuilds Docker image, and restarts containers

set -e  # Exit on error

echo "=================================================="
echo "SAG Deployment Script"
echo "=================================================="

cd ~/silent-auction-gallery

echo "[1/5] Pulling latest code from GitHub..."
git pull origin main

echo "[2/5] Building Docker image..."
docker build -t silent-auction-gallery:latest .

echo "[3/5] Stopping old containers..."
docker compose -f docker-compose.prod.yml down

echo "[4/5] Starting new containers..."
docker compose -f docker-compose.prod.yml up -d

echo "[5/5] Waiting for application startup..."
sleep 5

echo ""
echo "=================================================="
echo "Deployment complete!"
echo "=================================================="
echo ""
echo "Checking application status..."
docker compose -f docker-compose.prod.yml logs app | tail -20

echo ""
echo "Testing health endpoint..."
curl -s http://localhost:3000/health | jq .

echo ""
echo "✅ Deployment successful!"
