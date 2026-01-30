#!/bin/bash
# Silent Auction Gallery - Database Backup Script
# Usage: ./scripts/backup-db.sh [staging|production]

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-staging}
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S)-$ENVIRONMENT.sql"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Database Backup Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Backup File: ${BACKUP_FILE}${NC}"
echo ""

log() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Create backup directory
mkdir -p "$BACKUP_DIR"
log "Backup directory ready: $BACKUP_DIR"

# Determine compose file
if [ "$ENVIRONMENT" == "production" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
else
    COMPOSE_FILE="docker-compose.yml"
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    error "Docker Compose file not found: $COMPOSE_FILE"
fi

log "Using compose file: $COMPOSE_FILE"

# Check if postgres container exists
echo ""
echo -e "${BLUE}Checking database container...${NC}"

if ! docker-compose -f "$COMPOSE_FILE" ps postgres | grep -q "postgres"; then
    error "PostgreSQL container is not running. Start with: docker-compose -f $COMPOSE_FILE up -d"
fi

log "PostgreSQL container is running"

# Get database credentials from environment
DATABASE_USER=$(grep DATABASE_USER .env.${ENVIRONMENT} 2>/dev/null || echo "postgres")
DATABASE_NAME=$(grep DATABASE_NAME .env.${ENVIRONMENT} 2>/dev/null || echo "sag_db")

log "Database User: $DATABASE_USER"
log "Database Name: $DATABASE_NAME"

# Perform backup
echo ""
echo -e "${BLUE}Creating database backup...${NC}"

if docker-compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$DATABASE_USER" "$DATABASE_NAME" > "$BACKUP_FILE"; then
    
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Database backup created successfully"
    log "Backup size: $BACKUP_SIZE"
    
    # Create compressed backup
    gzip -k "$BACKUP_FILE"
    COMPRESSED_FILE="$BACKUP_FILE.gz"
    COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
    log "Compressed backup created: $COMPRESSED_SIZE"
    
    # Display backup info
    echo ""
    echo -e "${BLUE}Backup Information:${NC}"
    echo "  File:      $BACKUP_FILE"
    echo "  Size:      $BACKUP_SIZE"
    echo "  Compressed: $COMPRESSED_FILE"
    echo "  Compressed Size: $COMPRESSED_SIZE"
    echo "  Timestamp: $(date)"
    
    # Cleanup old backups (keep last 10)
    echo ""
    echo -e "${BLUE}Cleanup old backups...${NC}"
    ls -t "$BACKUP_DIR"/backup-*-$ENVIRONMENT.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f
    log "Old backups cleaned up (keeping last 10)"
    
    echo ""
    echo -e "${GREEN}✓ Backup completed successfully${NC}"
    exit 0
else
    error "Failed to create database backup"
fi
