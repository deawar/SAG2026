# Setup VPS Script - Quick Reference

## Identified & Fixed Issues ✅

### 5 Critical Failures:
1. ❌ **Docker Compose not installed** → ✅ Auto-detection & installation added
2. ❌ **Permission denied on /var/data** → ✅ Conditional sudo implementation
3. ❌ **Git clone to non-empty directory** → ✅ Fallback clone & copy logic
4. ❌ **Dockerfile not found** → ✅ Pre-build validation check
5. ❌ **docker-compose command not found** → ✅ Dynamic v1/v2 detection

---

## Before Running Again

### Check VPS Prerequisites:
```bash
# SSH into VPS
ssh dean@15.204.210.161

# Verify Docker Compose status
docker-compose --version  # OR
docker compose version

# Check sudo access (required for /var/* dirs)
sudo -l | grep NOPASS

# Check that .env.prod exists locally
ls -la .env.prod
```

### Troubleshooting Issues:
- **If "Permission denied" still occurs**: User `dean` needs passwordless sudo
  ```bash
  # On VPS (as root/sudoer):
  echo "dean ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/dean-nopass
  ```

- **If Docker Compose still not found**: Install manually
  ```bash
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  ```

---

## Run the Updated Script

```bash
# From the local project directory
bash setup-vps.sh

# Expected output (no errors):
✓ SSH connection successful
✓ Docker installed
✓ Docker Compose (v1 or v2) installed
✓ Directories created
✓ Repository ready
✓ Docker image built
✓ Services started
✓ Database connection successful
✓ Monitoring scripts created
✓ Backup scheduled
✓ VPS SETUP COMPLETE
```

---

## What Was Changed

### New Step 3.5: Docker Compose Installation
- Detects if Docker Compose v1 is available
- Detects if Docker Compose v2 is available (via `docker compose`)
- Automatically installs Docker Compose v1 if neither available

### Step 4: Smart Directory Creation
- Checks if `/var/data` is writable
- Uses sudo if needed to create system directories
- Fixes ownership to dean:dean

### Step 5: Better Repository Handling
- Detects if directory is already a git repository
- Handles non-empty directories gracefully
- Falls back to temp clone + copy if needed

### Step 7: Dockerfile Validation
- Checks if Dockerfile exists before building
- Reports detailed error if missing

### Steps 8, 9, 12, 13: Dynamic Docker Compose
```bash
COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker compose"
fi
${COMPOSE_CMD} -f docker-compose.prod.yml ...
```

---

## Key Commit Information

**File**: `setup-vps.sh`  
**Changes**: ~150 lines modified across 8 sections  
**Backward Compatibility**: ✅ All changes backward compatible  
**Testing**: Run script and monitor output

---

## After Setup Completes

### Verify Services:
```bash
ssh dean@15.204.210.161

# Check running containers
docker ps
# or
docker-compose -f /home/dean/silent-auction-gallery/docker-compose.prod.yml ps

# Check logs
docker-compose -f /home/dean/silent-auction-gallery/docker-compose.prod.yml logs -f
```

### Next Steps (from script output):
1. Configure DNS to point to 15.204.210.161
2. Setup SSL certificate with certbot
3. Configure Nginx reverse proxy (optional)
4. Enable monitoring/backups
5. Monitor application logs

---

**Status**: ✅ Script corrected and ready to use  
**Recommended**: Run script immediately to deploy to VPS
