#!/usr/bin/env bash
# =============================================================================
# Silent Auction Gallery - VPS Production Deploy Script
# Usage: ./deploy.sh [--skip-backup] [--skip-build]
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
COMPOSE_FILE="docker-compose.prod.yml"
APP_SERVICE="app"
DB_SERVICE="db"
APP_PORT="${PORT:-5000}"
HEALTH_URL="http://localhost:${APP_PORT}/health"
HEALTH_RETRIES=12        # 12 x 5s = 60s max wait
HEALTH_INTERVAL=5        # seconds between retries
BACKUP_DIR="./backups"
BACKUP_KEEP=10           # number of backup files to retain
SKIP_BACKUP=false
SKIP_BUILD=false

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()     { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] OK${NC} $*"; }
warn()    { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARN${NC} $*"; }
error()   { echo -e "${RED}[$(date '+%H:%M:%S')] ERROR${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}${BLUE}=== $* ===${NC}\n"; }

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case $arg in
    --skip-backup) SKIP_BACKUP=true ;;
    --skip-build)  SKIP_BUILD=true  ;;
    --help|-h)
      echo "Usage: $0 [--skip-backup] [--skip-build]"
      echo "  --skip-backup  Skip database backup (use with caution)"
      echo "  --skip-build   Skip docker image build (re-use existing image)"
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
header "Pre-flight Checks"

command -v docker >/dev/null 2>&1 || { error "docker not found"; exit 1; }
command -v git    >/dev/null 2>&1 || { error "git not found";    exit 1; }
success "docker and git available"

[[ -f "$COMPOSE_FILE" ]] || { error "$COMPOSE_FILE not found — run this script from the app root directory"; exit 1; }
success "$COMPOSE_FILE found"

[[ -f ".env.prod" ]] || warn ".env.prod not found — containers will use defaults only"

mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# Capture current state for rollback
# ---------------------------------------------------------------------------
PREVIOUS_SHA=$(git rev-parse HEAD)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log "Branch : ${CURRENT_BRANCH}"
log "Commit : ${PREVIOUS_SHA:0:8} — $(git log -1 --format='%s' | cut -c1-60)"

# ---------------------------------------------------------------------------
# Rollback function — called automatically on ERR
# ---------------------------------------------------------------------------
rollback() {
  error "Deploy failed — rolling back to ${PREVIOUS_SHA:0:8}"
  git checkout "$PREVIOUS_SHA" -- . 2>/dev/null || true

  if ! $SKIP_BUILD; then
    docker compose -f "$COMPOSE_FILE" build "$APP_SERVICE"
  fi
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

  warn "Rollback complete."
  warn "Check logs: docker compose -f $COMPOSE_FILE logs --tail=100 $APP_SERVICE"
  exit 1
}

trap 'rollback' ERR

# ---------------------------------------------------------------------------
# Step 1: Database backup
# ---------------------------------------------------------------------------
header "Step 1: Database Backup"

if $SKIP_BACKUP; then
  warn "Skipping backup (--skip-backup passed)"
else
  DB_RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running "$DB_SERVICE" 2>/dev/null | grep -c "$DB_SERVICE" || true)

  if [[ "$DB_RUNNING" -gt 0 ]]; then
    # Read credentials from .env.prod if available
    DB_USER="postgres"
    DB_NAME="silent_auction_gallery"
    if [[ -f ".env.prod" ]]; then
      DB_USER=$(grep -E '^DB_USER=' .env.prod | cut -d= -f2 | tr -d '"' || echo "postgres")
      DB_NAME=$(grep -E '^DB_NAME=' .env.prod | cut -d= -f2 | tr -d '"' || echo "silent_auction_gallery")
    fi

    BACKUP_FILE="${BACKUP_DIR}/backup-$(date +%Y%m%d-%H%M%S).sql"
    log "Backing up '${DB_NAME}' as user '${DB_USER}' to ${BACKUP_FILE} ..."

    docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
      pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

    BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    success "Backup saved: ${BACKUP_FILE} (${BACKUP_SIZE})"

    # Prune oldest backups beyond BACKUP_KEEP
    BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/backup-*.sql 2>/dev/null | wc -l || true)
    if (( BACKUP_COUNT > BACKUP_KEEP )); then
      ls -1t "${BACKUP_DIR}"/backup-*.sql | tail -n +"$((BACKUP_KEEP + 1))" | xargs rm -f
      log "Pruned old backups — keeping last ${BACKUP_KEEP}"
    fi
  else
    warn "DB container not running — skipping backup (first deploy?)"
  fi
fi

# ---------------------------------------------------------------------------
# Step 2: Pull latest code
# ---------------------------------------------------------------------------
header "Step 2: Pull Latest Code"

log "Fetching from origin/${CURRENT_BRANCH} ..."
git fetch origin

UPSTREAM_SHA=$(git rev-parse "origin/${CURRENT_BRANCH}")
if [[ "$PREVIOUS_SHA" == "$UPSTREAM_SHA" ]]; then
  warn "Already up to date — deploying current state anyway"
fi

git pull origin "$CURRENT_BRANCH"
NEW_SHA=$(git rev-parse HEAD)
success "At ${NEW_SHA:0:8} — $(git log -1 --format='%s' | cut -c1-72)"

# ---------------------------------------------------------------------------
# Step 3: Build new app image
# ---------------------------------------------------------------------------
header "Step 3: Build App Image"

if $SKIP_BUILD; then
  warn "Skipping build (--skip-build passed)"
else
  log "Building ${APP_SERVICE} image ..."
  docker compose -f "$COMPOSE_FILE" build "$APP_SERVICE"
  success "Image built"
fi

# ---------------------------------------------------------------------------
# Step 4: Start / restart containers
# ---------------------------------------------------------------------------
header "Step 4: Deploy Containers"

# up -d without 'down' — DB and Redis stay up, only app is recreated
log "Bringing up stack ..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
success "Containers started"

# ---------------------------------------------------------------------------
# Step 5: Health check with retry
# ---------------------------------------------------------------------------
header "Step 5: Health Check"

log "Waiting for app at ${HEALTH_URL} ..."

for i in $(seq 1 "$HEALTH_RETRIES"); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

  if [[ "$HTTP_STATUS" == "200" ]]; then
    success "App is healthy (attempt ${i}/${HEALTH_RETRIES})"
    break
  fi

  if [[ "$i" -eq "$HEALTH_RETRIES" ]]; then
    error "Health check failed after $((HEALTH_RETRIES * HEALTH_INTERVAL))s — last HTTP status: ${HTTP_STATUS}"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 "$APP_SERVICE"
    exit 1   # triggers rollback via ERR trap
  fi

  log "  Attempt ${i}/${HEALTH_RETRIES} — HTTP ${HTTP_STATUS} — retrying in ${HEALTH_INTERVAL}s ..."
  sleep "$HEALTH_INTERVAL"
done

# Deploy succeeded — disable rollback trap
trap - ERR

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
header "Deploy Complete"

echo -e "${GREEN}${BOLD}"
echo "  Previous : ${PREVIOUS_SHA:0:8}"
echo "  Deployed : ${NEW_SHA:0:8}  $(git log -1 --format='(%s)' | cut -c1-64)"
echo "  Branch   : ${CURRENT_BRANCH}"
echo "  Time     : $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${NC}"

docker compose -f "$COMPOSE_FILE" ps

echo ""
log "Useful commands:"
echo "  Logs  : docker compose -f $COMPOSE_FILE logs -f $APP_SERVICE"
echo "  Shell : docker compose -f $COMPOSE_FILE exec $APP_SERVICE sh"
echo "  Stats : docker stats"
