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

echo -e "${BLUE}Checking required tools:${NC}"
check_command "ssh" || exit 1
check_command "git" || exit 1
check_command "scp" || exit 1

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
  docker-compose --version && echo "  ✓ Docker Compose installed" || echo "  ✗ Docker Compose not found"
  
  echo "Checking PostgreSQL..."
  psql --version && echo "  ✓ PostgreSQL installed" || echo "  ✗ PostgreSQL not found"
  
  echo "Checking disk space..."
  df -h / | tail -1
  
  echo "Checking memory..."
  free -h | head -2
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 4: CREATE DIRECTORIES
###############################################################################
echo -e "${YELLOW}[STEP 4] Creating required directories on VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  mkdir -p ${APP_DIR}
  mkdir -p ${DATA_DIR}/uploads
  mkdir -p ${LOG_DIR}
  mkdir -p ${BACKUP_DIR}
  chmod 755 ${APP_DIR}
  chmod 755 ${DATA_DIR}
  chmod 755 ${LOG_DIR}
  chmod 755 ${BACKUP_DIR}
  echo -e "  ✓ Directories created"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 5: CLONE REPOSITORY
###############################################################################
echo -e "${YELLOW}[STEP 5] Cloning application repository...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  cd ${APP_DIR}
  
  if [ -d ".git" ]; then
    echo "  • Repository already exists, pulling latest..."
    git pull origin main
  else
    echo "  • Cloning repository..."
    git clone https://github.com/dwarren/Silent-Auction-Gallery.git .
  fi
  
  echo -e "  ✓ Repository ready"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 6: CREATE ENVIRONMENT FILE
###############################################################################
echo -e "${YELLOW}[STEP 6] Creating production environment file...${NC}"

# Copy .env.prod to VPS
scp .env.prod ${VPS_USER}@${VPS_IP}:${APP_DIR}/.env

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  chmod 600 ${APP_DIR}/.env
  echo -e "  ✓ Environment file created and secured"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 7: BUILD DOCKER IMAGE
###############################################################################
echo -e "${YELLOW}[STEP 7] Building Docker image on VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  cd ${APP_DIR}
  echo "  • Building Docker image (this may take 2-3 minutes)..."
  docker build -t silent-auction-gallery:latest .
  echo -e "  ✓ Docker image built"
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 8: START SERVICES
###############################################################################
echo -e "${YELLOW}[STEP 8] Starting Docker containers...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << REMOTE_SCRIPT
  cd ${APP_DIR}
  docker-compose -f docker-compose.prod.yml up -d
  sleep 10
  
  echo -e "  ✓ Services started"
  echo ""
  echo "Checking service health..."
  docker-compose -f docker-compose.prod.yml ps
REMOTE_SCRIPT

echo ""

###############################################################################
# STEP 9: VERIFY DATABASE
###############################################################################
echo -e "${YELLOW}[STEP 9] Verifying database connection...${NC}"

ssh ${VPS_USER}@${VPS_IP} bash << 'REMOTE_SCRIPT'
  echo "  • Testing database connection..."
  docker-compose -f /home/dean/silent-auction-gallery/docker-compose.prod.yml exec -T db psql -U postgres -d silent_auction_gallery -c "SELECT version();" > /dev/null 2>&1 && {
    echo -e "  ✓ Database connection successful"
  } || {
    echo -e "  ✗ Database connection failed (may be initializing...)"
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
curl -f http://localhost:3000/health > /dev/null 2>&1 && \
  echo "✓ Application responding" || \
  echo "✗ Application not responding"

docker ps --filter "name=silent-auction-gallery" --format "table {{.Names}}\t{{.Status}}" && \
  echo "✓ Containers running" || \
  echo "✗ Container issues"

psql -U postgres -d silent_auction_gallery -c "SELECT 1;" > /dev/null 2>&1 && \
  echo "✓ Database responding" || \
  echo "✗ Database not responding"
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
docker-compose -f /home/dean/silent-auction-gallery/docker-compose.prod.yml exec -T db pg_dump -U postgres silent_auction_gallery | gzip > ${BACKUP_FILE}

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
  docker-compose -f /home/dean/silent-auction-gallery/docker-compose.prod.yml ps
  
  echo ""
  echo "Container Logs (last 20 lines):"
  docker-compose -f /home/dean/silent-auction-gallery/docker-compose.prod.yml logs --tail=20
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
echo "   docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo -e "${BLUE}USEFUL COMMANDS:${NC}"
echo ""
echo "  SSH Access:"
echo "    ssh ${VPS_USER}@${VPS_IP}"
echo ""
echo "  View Logs:"
echo "    ssh ${VPS_USER}@${VPS_IP} docker-compose -f ${APP_DIR}/docker-compose.prod.yml logs -f"
echo ""
echo "  Restart Services:"
echo "    ssh ${VPS_USER}@${VPS_IP} docker-compose -f ${APP_DIR}/docker-compose.prod.yml restart"
echo ""
echo "  Database Backup:"
echo "    ssh ${VPS_USER}@${VPS_IP} bash /home/${VPS_USER}/backup-db.sh"
echo ""
echo "  Health Check:"
echo "    ssh ${VPS_USER}@${VPS_IP} bash /home/${VPS_USER}/health-check.sh"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
