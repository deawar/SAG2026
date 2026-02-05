#!/bin/bash
# Silent Auction Gallery - Local Docker Development Start
# Usage: bash start-local-dev.sh
# This script sets up and runs the full development environment locally

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Silent Auction Gallery - Local Development Setup          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Docker
echo -e "${BLUE}[1/5]${NC} Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}❌ Docker not found. Please install Docker Desktop.${NC}"
    echo "   Download: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo -e "${GREEN}✅ Docker is installed ($(docker --version))${NC}"
echo ""

# Step 2: Check Docker Compose
echo -e "${BLUE}[2/5]${NC} Checking Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}❌ Docker Compose not found.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose is installed ($(docker-compose --version))${NC}"
echo ""

# Step 3: Stop existing containers
echo -e "${BLUE}[3/5]${NC} Cleaning up old containers..."
docker-compose down 2>/dev/null || true
echo -e "${GREEN}✅ Old containers stopped${NC}"
echo ""

# Step 4: Build and start
echo -e "${BLUE}[4/5]${NC} Building Docker images and starting services..."
echo "   This may take 2-5 minutes on first run..."
echo ""
docker-compose up --build -d

# Wait for services to be ready
echo ""
echo -e "${BLUE}[5/5]${NC} Waiting for services to be ready..."
sleep 5

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Services are running!${NC}"
else
    echo -e "${YELLOW}⚠️ Services may still be starting. Check logs below.${NC}"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ READY FOR TESTING                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Application URLs:${NC}"
echo "  🌐 Frontend:        http://localhost:3000"
echo "  🔗 API:             http://localhost:3000/api"
echo "  📊 WebSocket:       ws://localhost:3000/ws"
echo "  🗄️  Database:        localhost:5432 (postgres/postgres)"
echo ""
echo -e "${GREEN}Default Credentials:${NC}"
echo "  Database User:     postgres"
echo "  Database Password: postgres"
echo "  Database Name:     sag_db"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  View logs:         docker-compose logs -f"
echo "  View app logs:     docker-compose logs -f app"
echo "  View DB logs:      docker-compose logs -f postgres"
echo "  Stop services:     docker-compose down"
echo "  Run tests:         npm test"
echo "  Access database:   psql -h localhost -U postgres -d sag_db"
echo ""
echo -e "${BLUE}NEXT STEPS:${NC}"
echo "  1. Open browser: http://localhost:3000"
echo "  2. Click 'Sign Up' to create account"
echo "  3. Register as 'Teacher' (first account)"
echo "  4. Complete 2FA setup"
echo "  5. You'll be promoted to SITE_ADMIN"
echo ""
echo "To stop: Press Ctrl+C in this terminal, then run:"
echo "  docker-compose down"
echo ""
