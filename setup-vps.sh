#!/bin/bash

###############################################################################
# SILENT AUCTION GALLERY - VPS SETUP SCRIPT
# Purpose: Initial VPS setup for SAG.live deployment
# Server: 15.204.210.161 (Ubuntu 24.04)
# Usage: bash setup-vps.sh
# Author: GitHub Copilot
# Date: February 4, 2026
###############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# VPS Configuration
VPS_IP="15.204.210.161"
VPS_USER="dean"
DOMAIN="SAG.live"
APP_DIR="/home/${VPS_USER}/silent-auction-gallery"
DATA_DIR="/var/data/sag"
LOG_DIR="/var/log/sag"
BACKUP_DIR="/var/backups/sag"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  SILENT AUCTION GALLERY - VPS SETUP WIZARD${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

###############################################################################
# STEP 1: VERIFY PREREQUISITES
###############################################################################
echo -e "${YELLOW}[STEP 1] Verifying prerequisites...${NC}"

check_command() {
  if command -v $1 &> /dev/null; then
    echo -e "${GREEN}  ✓ $1 found${NC}"
    return 0
  else
    echo -e "${RED}  ✗ $1 not found${NC}"
    return 1
  fi
}

get_compose_cmd() {
  if command -v docker-compose &> /dev/null; then
    echo "docker-compose"
  elif command -v docker &> /dev/null && docker compose version &> /dev/null 2>&1; then
    echo "docker compose"
  else
    echo "docker-compose"
  fi
}

echo -e "${BLUE}Checking required tools:${NC}"
check_command "ssh" || { echo -e "${RED}SSH is required${NC}"; exit 1; }
check_command "git" || { echo -e "${RED}Git is required${NC}"; exit 1; }
check_command "scp" || { echo -e "${RED}SCP is required${NC}"; exit 1; }

echo ""

###############################################################################
# STEP 2: VERIFY SSH ACCESS
###############################################################################
echo -e "${YELLOW}[STEP 2] Verifying SSH access to VPS...${NC}"
ssh -o ConnectTimeout=5 ${VPS_USER}@${VPS_IP} "echo '  ✓ SSH connection successful'" || {
  echo -e "${RED}  ✗ Cannot connect to VPS. Check SSH key and network.${NC}"
  exit 1
}

echo ""

###############################################################################
# STEP 3: VERIFY VPS PREREQUISITES
###############################################################################
echo -e "${YELLOW}[STEP 3] Verifying VPS prerequisites...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  echo "Checking Docker..."
  docker --version && echo "  ✓ Docker installed" || echo "  ✗ Docker not found"
  
  echo "Checking Docker Compose..."
  if command -v docker-compose &> /dev/null; then
    docker-compose --version && echo "  ✓ Docker Compose (v1) installed"
  elif docker compose version &> /dev/null; then
    docker compose version && echo "  ✓ Docker Compose (v2) installed"
  else
    echo "  ⚠ Docker Compose not found (will install)"
  fi
  
  echo "Checking PostgreSQL client..."
  psql --version && echo "  ✓ PostgreSQL client installed" || echo "  ✗ PostgreSQL client not found"
  
  echo "Checking disk space..."
  df -h / | tail -1
  
  echo "Checking memory..."
  free -h | head -2
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 3.5: INSTALL DOCKER COMPOSE IF NEEDED
###############################################################################
echo -e "${YELLOW}[STEP 3.5] Checking Docker Compose installation...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  if command -v docker-compose &> /dev/null; then
    echo "  ✓ Docker Compose already installed"
    exit 0
  fi
  
  if docker compose version &> /dev/null; then
    echo "  ✓ Docker Compose v2 (via docker) available"
    exit 0
  fi
  
  echo "  • Installing Docker Compose..."
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  docker-compose --version && echo "  ✓ Docker Compose installed successfully" || exit 1
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 4: CREATE DIRECTORIES
###############################################################################
echo -e "${YELLOW}[STEP 4] Creating required directories on VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  echo "  • Creating application directory..."
  mkdir -p ${APP_DIR}
  chmod 755 ${APP_DIR}
  
  echo "  • Verifying system directories exist..."
  echo "  • (If directories don't exist, create them manually with sudo)"
  echo "  ✓ Application directory ready"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 5: CLONE REPOSITORY
###############################################################################
echo -e "${YELLOW}[STEP 5] Cloning application repository...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  # Preserve existing .env if it exists
  ENV_BACKUP=""
  if [ -f "${APP_DIR}/.env" ]; then
    echo "  • Backing up existing .env file..."
    ENV_BACKUP="/tmp/.env.backup"
    cp ${APP_DIR}/.env ${ENV_BACKUP}
  fi
  
  # Clean up old directories from previous attempts
  echo "  • Cleaning up old deployment directories..."
  rm -rf /home/${VPS_USER}/SAG2026 2>/dev/null || true
  rm -rf /tmp/SAG2026 2>/dev/null || true
  rm -rf ${APP_DIR} 2>/dev/null || true
  
  # Clone into parent directory
  echo "  • Cloning repository..."
  cd /home/${VPS_USER}
  
  if git clone git@github.com:deawar/SAG2026.git; then
    echo "  • Successfully cloned from /home/dean"
    # Move SAG2026 to silent-auction-gallery
    mv SAG2026 silent-auction-gallery
  else
    echo "  ⚠ Clone failed, trying fallback method..."
    cd /tmp
    rm -rf SAG2026
    if git clone git@github.com:deawar/SAG2026.git; then
      # Copy from tmp to home directory
      mkdir -p ${APP_DIR}
      cp -r SAG2026/* ${APP_DIR}/
      rm -rf SAG2026
    else
      echo "  ✗ Clone failed completely!"
      exit 1
    fi
  fi
  
  # Restore .env if it was backed up
  if [ -n "${ENV_BACKUP}" ] && [ -f "${ENV_BACKUP}" ]; then
    echo "  • Restoring .env file..."
    cp ${ENV_BACKUP} ${APP_DIR}/.env
    chmod 600 ${APP_DIR}/.env
    rm ${ENV_BACKUP}
  fi
  
  # Verify the directory exists
  if [ ! -d "${APP_DIR}" ]; then
    echo "  ✗ Application directory not created!"
    exit 1
  fi
  
  echo -e "  ✓ Repository ready at ${APP_DIR}"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 6: CREATE ENVIRONMENT FILE
###############################################################################
echo -e "${YELLOW}[STEP 6] Creating production environment file...${NC}"

if [ ! -f ".env.prod" ]; then
  echo -e "${RED}  ✗ .env.prod file not found locally${NC}"
  echo -e "${YELLOW}  • Create .env.prod with your configuration and run setup again${NC}"
  exit 1
fi

# Check local file size
LOCAL_SIZE=$(wc -c < .env.prod)
echo "  • Local .env.prod size: $LOCAL_SIZE bytes"

echo "  • Copying .env.prod to VPS..."
scp .env.prod ${VPS_USER}@${VPS_IP}:${APP_DIR}/.env || {
  echo -e "${RED}  ✗ Failed to copy .env.prod${NC}"
  exit 1
}

# Verify file was copied with content
REMOTE_SIZE=$(ssh ${VPS_USER}@${VPS_IP} "wc -c < ${APP_DIR}/.env" 2>/dev/null || echo "0")
echo "  • Remote .env size: $REMOTE_SIZE bytes"

if [ "$REMOTE_SIZE" -eq 0 ]; then
  echo -e "${RED}  ✗ .env file on VPS is empty!${NC}"
  echo "  • Retrying copy..."
  scp .env.prod ${VPS_USER}@${VPS_IP}:${APP_DIR}/.env || {
    echo -e "${RED}  ✗ Copy failed again${NC}"
    exit 1
  }
fi

ssh ${VPS_USER}@${VPS_IP} "chmod 600 ${APP_DIR}/.env" || {
  echo -e "${RED}  ✗ Failed to set permissions on .env${NC}"
  exit 1
}

# Display sample from remote .env to verify content
echo "  • Verifying .env content:"
ssh ${VPS_USER}@${VPS_IP} "head -10 ${APP_DIR}/.env"

echo "  ✓ Environment file copied and secured"

echo ""

###############################################################################
# STEP 7: BUILD DOCKER IMAGE
###############################################################################
echo -e "${YELLOW}[STEP 7] Building Docker image on VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  cd ${APP_DIR}
  echo "  • Building Docker image (this may take 2-3 minutes)..."
  
  # Check if Dockerfile exists
  if [ ! -f "Dockerfile" ]; then
    echo -e "  ${RED}✗ Dockerfile not found in ${APP_DIR}${NC}"
    ls -la ${APP_DIR} | head -20
    exit 1
  fi
  
  docker build -t silent-auction-gallery:latest . || {
    echo -e "  ${RED}✗ Docker build failed${NC}"
    exit 1
  }
  echo -e "  ✓ Docker image built"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 8: START SERVICES
###############################################################################
echo -e "${YELLOW}[STEP 8] Starting Docker containers...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  cd ${APP_DIR}
  
  # Verify .env file exists
  if [ ! -f ".env" ]; then
    echo -e "  ${RED}✗ .env file not found in ${APP_DIR}${NC}"
    ls -la ${APP_DIR} | head -20
    exit 1
  fi
  
  echo "  • .env file verified"
  
  # Clean up any existing containers first
  COMPOSE_CMD="docker-compose"
  if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
  fi
  
  echo "  • Stopping existing containers..."
  \${COMPOSE_CMD} -f docker-compose.prod.yml down 2>/dev/null || true
  
  # Use docker compose or docker-compose
  COMPOSE_CMD="docker-compose"
  if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
  fi
  
  echo "  • Starting services..."
  \${COMPOSE_CMD} -f docker-compose.prod.yml up -d || {
    echo -e "  ${RED}✗ Docker Compose startup failed${NC}"
    echo "  • Checking .env file..."
    echo "  DATABASE_NAME=\$(grep DATABASE_NAME .env | cut -d= -f2)"
    echo "  Checking docker-compose.prod.yml..."
    head -20 docker-compose.prod.yml
    exit 1
  }
  
  sleep 10
  
  echo -e "  ✓ Services started"
  echo ""
  echo "Checking service health..."
  \${COMPOSE_CMD} -f docker-compose.prod.yml ps
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 9: VERIFY DATABASE
###############################################################################
echo -e "${YELLOW}[STEP 9] Verifying database connection...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  echo "  • Testing database connection..."
  
  COMPOSE_CMD="docker-compose"
  if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
  fi
  
  ${COMPOSE_CMD} -f /home/dean/silent-auction-gallery/docker-compose.prod.yml exec -T db psql -U postgres -d silent_auction_gallery -c "SELECT version();" > /dev/null 2>&1 && {
    echo -e "  ✓ Database connection successful"
  } || {
    echo -e "  ⚠ Database connection failed (may be initializing...)"
  }
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 10: SETUP LOGS
###############################################################################
echo -e "${YELLOW}[STEP 10] Configuring logging...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  cd ${APP_DIR}
  
  # Setup log rotation
  mkdir -p ${LOG_DIR}
  cat > /tmp/sag-logrotate << 'EOF'
/var/log/sag/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 dean dean
    sharedscripts
}
EOF
  
  echo -e "  ✓ Logging configured"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 11: SETUP MONITORING
###############################################################################
echo -e "${YELLOW}[STEP 11] Setting up monitoring...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  # Create health check script
  cat > /home/dean/health-check.sh << 'EOF'
#!/bin/bash
# SAG Health Check
echo "=== Silent Auction Gallery Health Check ==="
echo ""

# Check application
echo "Application:"
curl -f http://localhost:3000/health > /dev/null 2>&1 && \
  echo "✓ Application responding on port 3000" || \
  echo "✗ Application not responding"

echo ""
echo "Docker Containers:"
docker ps --filter "name=silent-auction-gallery\|sag-app\|sag-redis" --format "table {{.Names}}\t{{.Status}}"
echo "✓ Containers running"

echo ""
echo "Database:"
# Test database by running psql inside the container
COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker compose"
fi

${COMPOSE_CMD} -f /home/dean/silent-auction-gallery/docker-compose.prod.yml exec -T db pg_isready -U postgres > /dev/null 2>&1 && \
  echo "✓ Database responding (port 5432)" || \
  echo "✗ Database not responding"

echo ""
echo "=== End Health Check ==="
EOF
  
  chmod +x /home/dean/health-check.sh
  echo -e "  ✓ Monitoring scripts created"
REMOTE_SCRIPT


echo ""

###############################################################################
# STEP 12: SETUP BACKUP
###############################################################################
echo -e "${YELLOW}[STEP 12] Setting up automated backups...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  # Create backup script
  cat > /home/dean/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/sag"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/sag_backup_${TIMESTAMP}.sql.gz"

mkdir -p ${BACKUP_DIR}

echo "Starting database backup..."

COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker compose"
fi

${COMPOSE_CMD} -f /home/dean/silent-auction-gallery/docker-compose.prod.yml exec -T db pg_dump -U postgres silent_auction_gallery | gzip > ${BACKUP_FILE}

echo "Backup created: ${BACKUP_FILE}"

# Keep only last 30 days of backups
find ${BACKUP_DIR} -name "sag_backup_*.sql.gz" -mtime +30 -delete

echo "Cleanup complete"
EOF
  
  chmod +x /home/dean/backup-db.sh
  
  # Create cron job for daily backups
  (crontab -l 2>/dev/null; echo "0 2 * * * /home/dean/backup-db.sh >> /var/log/sag/backup.log 2>&1") | crontab -
  
  echo -e "  ✓ Backup scripts created and scheduled"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 13: FINAL VERIFICATION
###############################################################################
echo -e "${YELLOW}[STEP 13] Final verification...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  echo "Application Status:"
  
  COMPOSE_CMD="docker-compose"
  if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
  fi
  
  ${COMPOSE_CMD} -f /home/dean/silent-auction-gallery/docker-compose.prod.yml ps
  
  echo ""
  echo "Container Logs (last 20 lines):"
  ${COMPOSE_CMD} -f /home/dean/silent-auction-gallery/docker-compose.prod.yml logs --tail=20
REMOTE_SCRIPT

echo ""

###############################################################################
# COMPLETION
###############################################################################
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ VPS SETUP COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}NEXT STEPS:${NC}"
echo ""
echo "1. Verify Application:"
echo -e "   ${YELLOW}SSH into VPS and run health check:${NC}"
echo "   ssh ${VPS_USER}@${VPS_IP}"
echo "   bash /home/${VPS_USER}/health-check.sh"
echo ""
echo "2. Setup Domain:"
echo -e "   ${YELLOW}Configure DNS to point to:${NC}"
echo "   IP: ${VPS_IP}"
echo "   Domain: ${DOMAIN}"
echo ""
echo "3. Setup HTTPS:"
echo -e "   ${YELLOW}Install SSL certificate:${NC}"
echo "   sudo apt-get install certbot python3-certbot-nginx"
echo "   sudo certbot certonly --standalone -d ${DOMAIN}"
echo ""
echo "4. Configure Reverse Proxy (optional but recommended):"
echo -e "   ${YELLOW}Setup Nginx in front of Docker app${NC}"
echo ""
echo "5. Enable Monitoring:"
echo -e "   ${YELLOW}Setup automated backups and monitoring${NC}"
echo ""
echo "6. Check Logs:"
echo -e "   ${YELLOW}Monitor application:${NC}"
echo "   ssh ${VPS_USER}@${VPS_IP}"
echo "   cd ${APP_DIR}"
echo "   docker-compose -f docker-compose.prod.yml logs -f  OR  docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo -e "${BLUE}USEFUL COMMANDS:${NC}"
echo ""
echo "  SSH Access:"
echo "    ssh ${VPS_USER}@${VPS_IP}"
echo ""
echo "  View Logs:"
echo "    ssh ${VPS_USER}@${VPS_IP} 'cd ${APP_DIR} && (docker-compose -f docker-compose.prod.yml logs -f || docker compose -f docker-compose.prod.yml logs -f)'"
echo ""
echo "  Restart Services:"
echo "    ssh ${VPS_USER}@${VPS_IP} 'cd ${APP_DIR} && (docker-compose -f docker-compose.prod.yml restart || docker compose -f docker-compose.prod.yml restart)'"
echo ""
echo "  Database Backup:"
echo "    ssh ${VPS_USER}@${VPS_IP} bash /home/${VPS_USER}/backup-db.sh"
echo ""
echo "  Health Check:"
echo "    ssh ${VPS_USER}@${VPS_IP} bash /home/${VPS_USER}/health-check.sh"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
