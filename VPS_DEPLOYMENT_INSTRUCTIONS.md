# Silent Auction Gallery - VPS DEPLOYMENT GUIDE
## SAG.live on 15.204.210.161 (Ubuntu 24.04)

**Last Updated:** February 4, 2026  
**Status:** Ready for Deployment  
**Estimated Time:** 20-30 minutes

---

## QUICK START - ONE COMMAND DEPLOYMENT

From your local machine:

```bash
bash setup-vps.sh
```

This automated script will:
1. Verify SSH access to VPS
2. Check Docker/Docker-Compose installation
3. Clone application repository
4. Deploy environment file
5. Build Docker image
6. Start all services
7. Setup monitoring and backups
8. Display health check results

---

## DEPLOYMENT INFORMATION PROVIDED

| Item | Value |
|------|-------|
| **Server IP** | 15.204.210.161 |
| **Domain** | SAG.live |
| **OS** | Ubuntu 24.04 |
| **SSH User** | dean |
| **PostgreSQL** | Installed (latest) |
| **PostgreSQL User** | postgres |
| **PostgreSQL Password** | xP@rDj53tMXJBpKGAP3EiLz4 |
| **Docker** | v28.2.2 installed |
| **Docker Compose** | Available |

---

## MANUAL DEPLOYMENT STEPS (If Needed)

### Step 1: SSH into VPS

```bash
ssh dean@15.204.210.161
```

### Step 2: Create Application Directory

```bash
mkdir -p ~/silent-auction-gallery
mkdir -p /var/data/sag/uploads
mkdir -p /var/log/sag
mkdir -p /var/backups/sag
cd ~/silent-auction-gallery
```

### Step 3: Clone Repository

```bash
git clone https://github.com/dwarren/Silent-Auction-Gallery.git .
```

Or if already cloned:

```bash
git pull origin main
```

### Step 4: Copy Environment File

From your local machine:

```bash
scp .env.prod dean@15.204.210.161:~/silent-auction-gallery/.env
```

Then on VPS, verify it's readable only by owner:

```bash
chmod 600 ~/.env
```

### Step 5: Verify Docker Configuration

On VPS:

```bash
docker --version
docker-compose --version
```

Both should output version information.

### Step 6: Build Docker Image

```bash
cd ~/silent-auction-gallery
docker build -t silent-auction-gallery:latest .
```

This will take 2-3 minutes. Output should show successful build with "Successfully tagged".

### Step 7: Start Services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Verify services started:

```bash
docker-compose -f docker-compose.prod.yml ps
```

Should show:
- `silent-auction-gallery_app_1` running on port 3000
- `silent-auction-gallery_db_1` running on port 5432

### Step 8: Check Application Logs

```bash
docker-compose -f docker-compose.prod.yml logs app
```

Look for: "Server running on port 3000"

### Step 9: Test Database Connection

```bash
docker-compose -f docker-compose.prod.yml exec db psql -U postgres -d silent_auction_gallery -c "SELECT version();"
```

Should return PostgreSQL version info.

### Step 10: Test Application

```bash
curl http://localhost:3000
```

Should return HTML page (or HTTP 200).

---

## POST-DEPLOYMENT CONFIGURATION

### Setup SSL/HTTPS

Install Let's Encrypt certificate:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

# Generate certificate (replace with actual domain)
sudo certbot certonly --standalone -d SAG.live
```

Then update `.env` file:

```bash
vi ~/.env
```

Change:
```
HTTPS_ENABLED=true
SSL_KEY_PATH=/etc/letsencrypt/live/SAG.live/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/SAG.live/fullchain.pem
```

Restart application:

```bash
docker-compose -f docker-compose.prod.yml restart app
```

### Setup DNS Records

Point these DNS records to **15.204.210.161**:

```
A      SAG.live          15.204.210.161
A      www.SAG.live      15.204.210.161
CNAME  api.SAG.live      SAG.live
```

### Setup Nginx Reverse Proxy (Optional but Recommended)

Install Nginx:

```bash
sudo apt-get install -y nginx
```

Create Nginx configuration:

```bash
sudo tee /etc/nginx/sites-available/sag.live > /dev/null << 'EOF'
upstream sag_app {
    server localhost:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name SAG.live www.SAG.live;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name SAG.live www.SAG.live;

    ssl_certificate /etc/letsencrypt/live/SAG.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/SAG.live/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://sag_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://sag_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF
```

Enable Nginx configuration:

```bash
sudo ln -s /etc/nginx/sites-available/sag.live /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## MONITORING & MAINTENANCE

### Health Check

Run manual health check:

```bash
bash ~/health-check.sh
```

Or SSH and run:

```bash
ssh dean@15.204.210.161 bash ~/health-check.sh
```

### Automated Backup

Database is automatically backed up daily at 2 AM (UTC).

Manual backup:

```bash
bash ~/backup-db.sh
```

List recent backups:

```bash
ls -lh /var/backups/sag/
```

Restore from backup:

```bash
# List available backups
ls /var/backups/sag/

# Restore specific backup (replace TIMESTAMP)
docker-compose -f ~/silent-auction-gallery/docker-compose.prod.yml exec db bash -c 'zcat /var/backups/sag/sag_backup_TIMESTAMP.sql.gz | psql -U postgres silent_auction_gallery'
```

### View Application Logs

Real-time logs:

```bash
docker-compose -f ~/silent-auction-gallery/docker-compose.prod.yml logs -f app
```

Last 100 lines:

```bash
docker-compose -f ~/silent-auction-gallery/docker-compose.prod.yml logs --tail=100 app
```

Database logs:

```bash
docker-compose -f ~/silent-auction-gallery/docker-compose.prod.yml logs -f db
```

### Restart Services

Restart all services:

```bash
docker-compose -f ~/silent-auction-gallery/docker-compose.prod.yml restart
```

Restart just the app:

```bash
docker-compose -f ~/silent-auction-gallery/docker-compose.prod.yml restart app
```

### Update Application

Pull latest code:

```bash
cd ~/silent-auction-gallery
git pull origin main
```

Rebuild and restart:

```bash
docker-compose -f docker-compose.prod.yml down
docker build -t silent-auction-gallery:latest .
docker-compose -f docker-compose.prod.yml up -d
```

---

## TROUBLESHOOTING

### Port 3000 Already in Use

Check what's using port 3000:

```bash
sudo lsof -i :3000
```

Kill the process:

```bash
sudo kill -9 <PID>
```

Then restart services:

```bash
docker-compose -f docker-compose.prod.yml restart app
```

### Database Connection Failed

Check database is running:

```bash
docker-compose -f docker-compose.prod.yml ps db
```

If not running, start it:

```bash
docker-compose -f docker-compose.prod.yml up -d db
```

Test connection:

```bash
psql -U postgres -h localhost -d silent_auction_gallery -c "SELECT 1;"
```

If prompted for password, enter: `xP@rDj53tMXJBpKGAP3EiLz4`

### Application Not Responding

Check container status:

```bash
docker-compose -f docker-compose.prod.yml ps
```

If container crashed, view logs:

```bash
docker-compose -f docker-compose.prod.yml logs app
```

Restart container:

```bash
docker-compose -f docker-compose.prod.yml restart app
```

### Docker Build Failed

Clear cache and rebuild:

```bash
cd ~/silent-auction-gallery
docker system prune -a
docker build -t silent-auction-gallery:latest .
```

### Disk Space Issues

Check disk usage:

```bash
df -h
```

If full, check Docker images and containers:

```bash
docker system df
```

Cleanup old images:

```bash
docker image prune -a
docker container prune
```

---

## SECURITY CHECKLIST

- [ ] SSH key-based authentication enabled (no password login)
- [ ] Firewall configured (UFW)
- [ ] HTTPS/SSL certificate installed
- [ ] Database password is strong (✓ Done)
- [ ] .env file permissions set to 600 (✓ In setup script)
- [ ] Regular backups configured (✓ In setup script)
- [ ] Application logs monitored
- [ ] Docker images kept up to date
- [ ] Security patches applied monthly

### Setup Firewall (UFW)

```bash
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw status
```

---

## PERFORMANCE TUNING

### Database Connection Pool

Edit `.env`:

```
DB_POOL_MIN=2
DB_POOL_MAX=20
```

Higher values for more concurrent users, lower values for less memory.

### Node.js Memory Limit

Edit `docker-compose.prod.yml`:

```yaml
services:
  app:
    environment:
      NODE_OPTIONS: "--max-old-space-size=1024"
```

### Enable Compression

Already enabled in Express app, verify with:

```bash
curl -I http://localhost:3000 | grep -i encoding
```

Should show: `Content-Encoding: gzip`

---

## CONTINUOUS DEPLOYMENT (Optional)

To auto-deploy on git push:

Create `/home/dean/deploy.sh`:

```bash
#!/bin/bash
cd ~/silent-auction-gallery
git pull origin main
docker-compose -f docker-compose.prod.yml down
docker build -t silent-auction-gallery:latest .
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml logs app
```

Setup GitHub webhook or use cron job to pull and deploy on schedule.

---

## SUPPORT & NEXT STEPS

**Immediate Actions:**

1. ✅ Run `bash setup-vps.sh` from your local machine
2. ✅ Wait for deployment to complete (10-15 minutes)
3. ✅ Verify application is running: `ssh dean@15.204.210.161 bash ~/health-check.sh`
4. ✅ Configure DNS records to point to VPS IP
5. ✅ Setup SSL certificate once DNS is configured

**This Week:**

- [ ] Test all workflows on production domain
- [ ] Monitor application logs
- [ ] Verify backups are running
- [ ] Test backup restoration

**Next Month:**

- [ ] Enable payment processing
- [ ] Configure email notifications
- [ ] Setup uptime monitoring
- [ ] Setup log aggregation

---

**Questions?** Check the logs:

```bash
ssh dean@15.204.210.161
cd ~/silent-auction-gallery
docker-compose -f docker-compose.prod.yml logs app
```

**Emergency Contact:** If something breaks, rollback with:

```bash
git reset --hard HEAD~1
docker-compose -f docker-compose.prod.yml down
docker build -t silent-auction-gallery:latest .
docker-compose -f docker-compose.prod.yml up -d
```

---

**Status:** Ready for production deployment ✅
