#!/bin/bash
# Silent Auction Gallery - Health Check Script
# Usage: ./scripts/health-check.sh

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

HOST=${1:-localhost}
PORT=${2:-5000}
TIMEOUT=${3:-30}

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Health Check Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Host: ${HOST}${NC}"
echo -e "${YELLOW}Port: ${PORT}${NC}"
echo -e "${YELLOW}Timeout: ${TIMEOUT}s${NC}"
echo ""

log() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

PASSED=0
FAILED=0

# Test 1: Health endpoint
echo -e "${BLUE}Test 1: Health Endpoint${NC}"
if curl -sf -m 5 "http://${HOST}:${PORT}/health" > /dev/null 2>&1; then
    log "Health endpoint responded"
    PASSED=$((PASSED + 1))
    
    # Get health details
    HEALTH=$(curl -s "http://${HOST}:${PORT}/health")
    echo "  Response: $HEALTH" | head -c 100
    echo ""
else
    error "Health endpoint did not respond"
    FAILED=$((FAILED + 1))
fi

# Test 2: Database status (from health endpoint)
echo ""
echo -e "${BLUE}Test 2: Database Connection${NC}"
if HEALTH=$(curl -s "http://${HOST}:${PORT}/health") && echo "$HEALTH" | grep -q '"database":"ok"'; then
    log "Database is connected"
    PASSED=$((PASSED + 1))
else
    warning "Could not verify database status"
fi

# Test 3: API Response Time
echo ""
echo -e "${BLUE}Test 3: API Response Time${NC}"
START=$(date +%s%N)
if curl -sf -m 5 "http://${HOST}:${PORT}/api/auctions" > /dev/null 2>&1; then
    END=$(date +%s%N)
    DURATION=$(( (END - START) / 1000000 ))
    if [ $DURATION -lt 1000 ]; then
        log "API responded in ${DURATION}ms"
        PASSED=$((PASSED + 1))
    else
        warning "API responded in ${DURATION}ms (slow)"
        PASSED=$((PASSED + 1))
    fi
else
    error "API did not respond"
    FAILED=$((FAILED + 1))
fi

# Test 4: Authentication endpoint
echo ""
echo -e "${BLUE}Test 4: Authentication Endpoint${NC}"
if curl -sf -m 5 -X POST "http://${HOST}:${PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}' > /dev/null 2>&1; then
    log "Authentication endpoint is accessible"
    PASSED=$((PASSED + 1))
else
    warning "Authentication endpoint check inconclusive"
fi

# Test 5: Docker container status
echo ""
echo -e "${BLUE}Test 5: Docker Container Status${NC}"
if command -v docker &> /dev/null; then
    if docker ps --filter "name=sag-app" --filter "status=running" | grep -q "sag-app"; then
        log "Docker container is running"
        PASSED=$((PASSED + 1))
    else
        error "Docker container is not running"
        FAILED=$((FAILED + 1))
    fi
else
    warning "Docker not installed, skipping container check"
fi

# Test 6: Database container status
echo ""
echo -e "${BLUE}Test 6: Database Container Status${NC}"
if command -v docker &> /dev/null; then
    if docker ps --filter "name=sag-postgres" --filter "status=running" | grep -q "sag-postgres"; then
        log "Database container is running"
        PASSED=$((PASSED + 1))
    else
        error "Database container is not running"
        FAILED=$((FAILED + 1))
    fi
else
    warning "Docker not installed, skipping database container check"
fi

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Health Check Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo -e "Total:  $(($PASSED + $FAILED))"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All health checks passed${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}✗ Some health checks failed${NC}"
    exit 1
fi
