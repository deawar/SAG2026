# Dev Server Deployment Guide - Information Needed
**Date:** February 4, 2026

---

## 🚀 Option 1: Deploy to VPS (What I Need)

### **A. Server/VPS Information**

```
Server IP Address:           [15.204.210.161]
SSH Username:                [dean]
SSH Key Location:            [Already configured ✓]
Server OS:                   [Ubuntu/Debian/Other?]
```

**Questions to answer:**
- [ ] Server OS and version? (e.g., Ubuntu 22.04)
- [ ] Is Docker already installed? (`docker --version`)
- [ ] Is Docker Compose installed? (`docker-compose --version`)
- [ ] Available disk space? (`df -h`)
- [ ] Available RAM? (`free -h`)
- [ ] Can I SSH without password? (✓ SSH key already set up)

---

### **B. Domain/Port Information**

```
Development Domain:          [sag-dev.live or similar?]
Development IP:              [15.204.210.161]
Frontend Port (HTTP):        [3000 or 8000?]
Backend Port (if separate):  [3001 or 5000?]
Database Port (internal):    [5432 - keep private]
```

**Questions:**
- [ ] What domain/subdomain should dev use?
- [ ] What ports are available on VPS?
- [ ] Should it use HTTPS or HTTP for dev?
- [ ] Any firewall rules I need to know about?

---

### **C. Database Information**

```
Database Name:               [sag_db]
Database User:               [postgres]
Database Password:           [SECURE - needs .env]
Database Backup Location:    [/backups or /data/backups?]
```

**Questions:**
- [ ] Do you have a secure database password to use?
- [ ] Should I create backups? Where to store?
- [ ] Keep existing data or fresh install?
- [ ] Need data migration from other environment?

---

### **D. Environment Variables**

Create a `.env.prod` file with these (I'll help you create it):

```bash
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=sag_db
DATABASE_USER=postgres
DATABASE_PASSWORD=[SECURE]

# JWT & Auth
JWT_SECRET=[GENERATE NEW - min 32 chars]
JWT_ACCESS_EXPIRY=900s
JWT_REFRESH_EXPIRY=604800s

# Payment Gateways (Leave as TEST keys for dev)
STRIPE_API_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxx

# Email (Use test provider or disable)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=[test account]
SMTP_PASSWORD=[test account]

# Frontend
API_BASE_URL=http://15.204.210.161:3000/api
WS_URL=ws://15.204.210.161:3000/ws
```

**Questions:**
- [ ] Do you have JWT_SECRET value?
- [ ] Should email be disabled in dev or use test provider?
- [ ] Any test payment gateway keys to use?

---

### **E. Git Repository Information**

```
GitHub Repo:                 [https://github.com/dwarren/Silent-Auction-Gallery]
Branch to Deploy:            [main]
Auto-update on push?         [Yes/No - webhook?]
```

**Questions:**
- [ ] Public or private GitHub repo?
- [ ] Should deployment auto-trigger on git push?
- [ ] Need GitHub Actions CI/CD pipeline?

---

## ⚡ Option 2: Alternative Testing Methods (Recommended First)

I think you should **test locally first** before pushing to VPS. Here's why:

### **A. Docker Compose Locally (FASTEST - 5 minutes)**

Already have everything set up:
```bash
cd c:\Users\dwarren\...\Silent-Auction-Gallery
docker-compose up --build
```

**Pros:**
- ✅ Runs immediately on your machine
- ✅ Full stack (frontend + backend + database)
- ✅ Identical to VPS environment
- ✅ Easy to stop/restart
- ✅ Can test entire workflow locally
- ✅ No security/firewall concerns
- ✅ Quick iteration

**Cons:**
- ❌ Only accessible from your machine
- ❌ Performance depends on your PC

---

### **B. Integration Test Suite (AUTOMATED)**

```bash
npm test
# Runs 450+ tests covering:
# - Authentication
# - Role hierarchy
# - Account creation
# - Payment processing
# - Visibility controls
```

**Pros:**
- ✅ Automated verification
- ✅ Tests all workflows
- ✅ Instant feedback
- ✅ Repeatable

**Cons:**
- ❌ Doesn't test UI manually
- ❌ No visual verification

---

### **C. Staging Environment (HYBRID)**

Set up on VPS but with:
- Test database (can reset anytime)
- Test payment keys
- Limited access (private IP or password)
- Separate from production

**Pros:**
- ✅ Full testing with real environment
- ✅ Team can access
- ✅ Realistic performance testing
- ✅ Safe to experiment

**Cons:**
- ❌ Need VPS access
- ❌ More complex setup
- ❌ Running costs

---

## 🎯 My Recommendation

### **Phase 1: Test Locally (TODAY - 15 minutes)**
```bash
# Run docker-compose locally to verify everything works
docker-compose up --build

# Check endpoints
curl http://localhost:3000
# Check API
curl http://localhost:3000/api/health

# Run tests
npm test
```

**Expected Result:** Everything works locally ✅

### **Phase 2: Deploy to VPS (THIS WEEK)**
Once local testing passes:
```bash
# SSH to VPS
ssh dean@15.204.210.161

# Clone repo (or pull latest)
git clone https://github.com/...

# Create .env.prod file
nano .env.prod

# Run with docker-compose
docker-compose -f docker-compose.prod.yml up -d

# Monitor logs
docker-compose logs -f
```

---

## 📋 Deployment Checklist

### **Pre-Deployment (Local Testing)**
- [ ] Run `docker-compose up` locally
- [ ] Test login page at `http://localhost:3000`
- [ ] Test account creation workflow
- [ ] Test role hierarchy
- [ ] Run `npm test` (all tests pass)
- [ ] Check console for errors
- [ ] Verify database connections

### **VPS Deployment**
- [ ] Server access confirmed (SSH working)
- [ ] Docker/Docker-Compose installed on VPS
- [ ] Git repository cloned on VPS
- [ ] `.env.prod` file created with secrets
- [ ] Database password secured
- [ ] Ports available (3000, 5432)
- [ ] Firewall rules configured
- [ ] Domain pointing to VPS IP

### **Post-Deployment**
- [ ] Container started successfully
- [ ] Health checks passing
- [ ] Logs show no errors
- [ ] Frontend loads at domain
- [ ] Login page works
- [ ] Can create test account
- [ ] Database persists data
- [ ] Monitoring/logging configured

---

## 🔧 Quick Start Scripts (What I Can Generate)

I can create these ready-to-use scripts for you:

1. **`setup-dev-server.sh`** - Automated VPS setup
   - Install Docker/Docker-Compose
   - Clone repo
   - Set up directories
   - Create .env file template

2. **`deploy.sh`** - Deployment automation
   - Git pull latest
   - Build Docker image
   - Start/restart containers
   - Run health checks
   - Show logs

3. **`monitor.sh`** - Container monitoring
   - Check container status
   - Show real-time logs
   - Check database health
   - Check API health
   - Alert on issues

4. **`backup-db.sh`** - Database backup
   - Dump PostgreSQL
   - Compress backup
   - Store with timestamp
   - Prune old backups

---

## 🚨 Security Considerations for VPS

⚠️ **Before pushing to VPS:**
- [ ] Never commit `.env` files (already in .gitignore ✓)
- [ ] Use strong database password (min 32 chars)
- [ ] Use strong JWT_SECRET (min 32 chars)
- [ ] Use test payment keys (NOT production)
- [ ] Disable email in dev (or use test provider)
- [ ] Database port not exposed publicly
- [ ] SSH key-based auth (not password) ✓
- [ ] Firewall configured
- [ ] HTTPS certificate (for production later)

---

## 📊 What You Need to Tell Me

**Priority 1 (Critical):**
1. [ ] Server OS version
2. [ ] Is Docker/Docker-Compose installed?
3. [ ] What port should app use? (3000 is default)
4. [ ] Database password (create secure one)

**Priority 2 (Important):**
1. [ ] Development domain/subdomain
2. [ ] Should email be enabled in dev?
3. [ ] Do you want auto-deploy on git push?
4. [ ] Need monitoring/alerting setup?

**Priority 3 (Nice to Have):**
1. [ ] Backup strategy
2. [ ] Log aggregation preference
3. [ ] SSL/HTTPS needed?
4. [ ] Team access/permissions

---

## ✅ My Suggested Approach

**Option A: Start Local (RECOMMENDED)**
```bash
# 1. Run locally first (5 min)
docker-compose up --build

# 2. Test everything works (10 min)
# - Open http://localhost:3000
# - Create test account
# - Test workflows

# 3. Then deploy to VPS (when ready)
# - VPS setup: 15 min
# - Deploy: 5 min
# - Testing: 10 min
```

**Option B: Go Straight to VPS**
```bash
# 1. SSH to server
# 2. Install Docker (if needed)
# 3. Clone repo
# 4. Run docker-compose
# 5. Test everything works
```

---

## 📞 What I'm Ready to Do

With the information above, I can:
- ✅ Generate deployment scripts
- ✅ Create `.env.prod` template
- ✅ Set up docker-compose for production
- ✅ Configure monitoring/logging
- ✅ Create health check endpoints
- ✅ Set up automated backups
- ✅ Create troubleshooting guide
- ✅ Document the entire process

---

## 🎯 Next Steps

**Tell me:**
1. Should I test locally first? (recommended)
2. What's your VPS OS version?
3. Is Docker installed on VPS?
4. What domain/port for dev?
5. What should be in the `.env.prod` file?

**Then I'll:**
1. Create deployment scripts
2. Set up docker-compose for VPS
3. Create monitoring solution
4. Document everything
5. Deploy and test with you

---

**Status:** Ready to deploy  
**Recommended:** Test locally first (15 min), then VPS (30 min)
