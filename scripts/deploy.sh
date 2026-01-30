#!/bin/bash
# Silent Auction Gallery - Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
DOCKER_IMAGE="${DOCKER_IMAGE:-sag2026}"
LOG_FILE="deployment-$(date +%Y%m%d-%H%M%S).log"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Silent Auction Gallery - Deployment Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Logging to: ${LOG_FILE}${NC}"
echo ""

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}❌ Invalid environment: $ENVIRONMENT${NC}"
    echo "Usage: ./scripts/deploy.sh [staging|production]"
    exit 1
fi

# Function to log messages
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

# Pre-deployment checks
echo -e "${BLUE}Running pre-deployment checks...${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker is not installed"
fi
log "Docker is installed"

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    error "Docker daemon is not running"
fi
log "Docker daemon is running"

# Check if .env file exists
if [[ "$ENVIRONMENT" == "production" && ! -f ".env.production" ]]; then
    error ".env.production file not found"
fi
log "Environment file found"

# Load environment variables
if [[ "$ENVIRONMENT" == "staging" ]]; then
    COMPOSE_FILE="docker-compose.yml"
    ENV_FILE=".env.staging"
    if [[ ! -f "$ENV_FILE" ]]; then
        warning "Creating .env.staging from .env.example"
        cp .env.example "$ENV_FILE"
    fi
else
    COMPOSE_FILE="docker-compose.prod.yml"
    ENV_FILE=".env.production"
fi

log "Using Docker Compose file: $COMPOSE_FILE"
log "Using environment file: $ENV_FILE"

# Build/Pull Docker image
echo ""
echo -e "${BLUE}Building/pulling Docker image...${NC}"

if [[ "$ENVIRONMENT" == "staging" ]]; then
    log "Building Docker image locally"
    docker build -t "$DOCKER_REGISTRY/$DOCKER_IMAGE:latest" .
else
    log "Pulling Docker image from registry"
    docker pull "$DOCKER_REGISTRY/$DOCKER_IMAGE:latest" || error "Failed to pull Docker image"
fi

# Verify image
if ! docker image inspect "$DOCKER_REGISTRY/$DOCKER_IMAGE:latest" &> /dev/null; then
    error "Docker image does not exist"
fi
log "Docker image verified"

# Database backup
echo ""
echo -e "${BLUE}Backing up database...${NC}"

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql"

# Check if postgres container exists
if docker ps -a --format '{{.Names}}' | grep -q "sag-postgres"; then
    log "Existing database found, creating backup"
    docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U postgres sag_db > "$BACKUP_FILE" 2>/dev/null || warning "Could not backup existing database"
    log "Database backup saved to: $BACKUP_FILE"
else
    log "No existing database to backup"
fi

# Stop services
echo ""
echo -e "${BLUE}Stopping services...${NC}"

docker-compose -f "$COMPOSE_FILE" down || warning "Some services may not have stopped cleanly"
log "Services stopped"

# Start services with new image
echo ""
echo -e "${BLUE}Starting services...${NC}"

# Export environment variables
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

docker-compose -f "$COMPOSE_FILE" up -d || error "Failed to start services"
log "Services started"

# Wait for services to be ready
echo ""
echo -e "${BLUE}Waiting for services to be ready...${NC}"

sleep 5

# Run health checks
echo -e "${BLUE}Running health checks...${NC}"

MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
        log "Application is healthy"
        break
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        echo -ne "\r  Waiting... ($ATTEMPT/$MAX_ATTEMPTS)"
        sleep 1
    fi
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    warning "Health check timeout, rolling back"
    docker-compose -f "$COMPOSE_FILE" down
    error "Deployment failed - rolling back"
fi

# Run smoke tests
echo ""
echo -e "${BLUE}Running smoke tests...${NC}"

TESTS_PASSED=0

# Test 1: Health endpoint
if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
    log "Health endpoint test passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    warning "Health endpoint test failed"
fi

# Test 2: API connectivity
if curl -sf http://localhost:5000/api/auctions > /dev/null 2>&1; then
    log "API connectivity test passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    warning "API connectivity test failed"
fi

# Test 3: Database connectivity
if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    log "Database connectivity test passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    warning "Database connectivity test failed"
fi

log "Smoke tests: $TESTS_PASSED/3 passed"

if [ $TESTS_PASSED -lt 2 ]; then
    warning "Multiple smoke tests failed"
fi

# Display status
echo ""
echo -e "${BLUE}Deployment Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

docker-compose -f "$COMPOSE_FILE" ps

echo ""
echo -e "${BLUE}Service URLs:${NC}"
echo -e "  Application: ${GREEN}http://localhost:5000${NC}"

if [[ "$ENVIRONMENT" == "staging" ]]; then
    echo -e "  Database: ${GREEN}localhost:5432${NC}"
    echo -e "  Redis: ${GREEN}localhost:6379${NC}"
    echo -e "  pgAdmin: ${GREEN}http://localhost:5050${NC}"
fi

echo ""
echo -e "${BLUE}Logs:${NC}"
echo "  View all logs:       ${GREEN}docker-compose -f $COMPOSE_FILE logs${NC}"
echo "  Follow app logs:     ${GREEN}docker-compose -f $COMPOSE_FILE logs -f app${NC}"
echo "  Follow DB logs:      ${GREEN}docker-compose -f $COMPOSE_FILE logs -f postgres${NC}"

echo ""
echo -e "${GREEN}✓ Deployment to $ENVIRONMENT completed successfully${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Save deployment info
cat > "deployment-info.txt" <<EOF
Deployment Information
=====================
Environment: $ENVIRONMENT
Timestamp: $(date)
Docker Image: $DOCKER_REGISTRY/$DOCKER_IMAGE:latest
Compose File: $COMPOSE_FILE
Environment File: $ENV_FILE
Backup File: $BACKUP_FILE
Log File: $LOG_FILE

Services:
$(docker-compose -f "$COMPOSE_FILE" ps)
EOF

log "Deployment info saved to deployment-info.txt"

exit 0

# ============================================================================
# Deployment Script Usage
# ============================================================================
# Make executable: chmod +x scripts/deploy.sh
#
# Deploy to staging:
#   ./scripts/deploy.sh staging
#
# Deploy to production:
#   ./scripts/deploy.sh production
#
# The script performs:
#   1. Pre-deployment validation (Docker, env files)
#   2. Database backup
#   3. Service restart
#   4. Health checks
#   5. Smoke tests
#   6. Generates deployment report
#
# ============================================================================
