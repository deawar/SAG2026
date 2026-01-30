#!/bin/bash
# Silent Auction Gallery - Rollback Script
# Usage: ./scripts/rollback.sh <version|latest>

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VERSION=${1:-latest}
LOG_FILE="rollback-$(date +%Y%m%d-%H%M%S).log"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Silent Auction Gallery - Rollback Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Rolling back to version: ${VERSION}${NC}"
echo -e "${YELLOW}Logging to: ${LOG_FILE}${NC}"
echo ""

log() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

# Determine compose file
COMPOSE_FILE="docker-compose.prod.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    COMPOSE_FILE="docker-compose.yml"
fi

# Get current version from running container
echo -e "${BLUE}Checking current deployment...${NC}"

CURRENT_IMAGE=$(docker-compose -f "$COMPOSE_FILE" ps app | grep -oP '(?<=sag2026:)[^\s]+' || echo "unknown")
log "Current version: $CURRENT_IMAGE"

# Stop services
echo ""
echo -e "${BLUE}Stopping services...${NC}"
docker-compose -f "$COMPOSE_FILE" down || warning "Services may not have stopped cleanly"
log "Services stopped"

# Update image tag
echo ""
echo -e "${BLUE}Rolling back to version: $VERSION${NC}"

ROLLBACK_IMAGE="sag2026:$VERSION"
log "Pulling image: $ROLLBACK_IMAGE"
docker pull "$ROLLBACK_IMAGE" || error "Failed to pull rollback image"

# Start with rollback image
export DOCKER_TAG="$VERSION"
export DOCKER_IMAGE="sag2026"

log "Starting services with rollback image"
docker-compose -f "$COMPOSE_FILE" up -d || error "Failed to start services"

# Wait and health check
echo ""
echo -e "${BLUE}Verifying rollback...${NC}"
sleep 5

MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
        log "Application is healthy"
        break
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        echo -ne "\r  Health check... ($ATTEMPT/$MAX_ATTEMPTS)"
        sleep 1
    fi
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    error "Rollback failed - health check timeout"
fi

echo ""
echo -e "${GREEN}✓ Rollback to $VERSION completed successfully${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

docker-compose -f "$COMPOSE_FILE" ps

exit 0
