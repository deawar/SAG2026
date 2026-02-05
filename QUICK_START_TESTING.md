# Quick Start - Local Testing vs VPS Deployment
**Status:** Ready to deploy  
**Recommendation:** Start with local testing (15 minutes)

---

## 🚀 FASTEST PATH: Local Testing with Docker

Your machine already has everything installed! ✅

### Step 1: Start Local Development (5 minutes)

**Windows/Mac/Linux:**
```bash
cd c:\Users\dwarren\...\Silent-Auction-Gallery
docker-compose up --build
```

**What this does:**
- Builds Docker image from Dockerfile
- Starts PostgreSQL database container
- Starts Node.js application container
- Initializes database with schema.sql
- All services connected on shared network

**Expected output:**
```
sag-postgres-dev | database system is ready to accept connections
sag-app | [App started] Listening on port 3000
```

### Step 2: Test the Application (5 minutes)

1. **Open Browser:**
   ```
   http://localhost:3000
   ```

2. **Create Account:**
   - Click "Sign Up"
   - Select "Teacher"
   - Fill in form
   - Password: `Password123!` (or your own - must have 12+ chars, uppercase, number, special char)
   - Click "Register"

3. **Setup 2FA:**
   - Scan QR code with Google Authenticator or Authy
   - Enter 6-digit code
   - Save backup codes

4. **Explore:**
   - You're now logged in as TEACHER
   - System auto-promotes first account to SITE_ADMIN
   - Access `/admin-dashboard.html` to test admin features
   - Go to `/auctions.html` to test auction page

### Step 3: Run Automated Tests (5 minutes)

```bash
npm test
```

**What this tests:**
- 450+ unit and integration tests
- Authentication and authorization
- Role hierarchy and visibility
- RBAC enforcement
- Data isolation
- All major workflows

**Expected result:**
```
Test Suites: XX passed, XX total
Tests:       450 passed, 450 total
Snapshots:   0 total
Time:        XX.XXXs
```

---

## 📊 Local Testing Verification Checklist

After starting with `docker-compose up`:

### Basic Functionality
- [ ] Navigate to http://localhost:3000 → See login page
- [ ] Click "Sign Up" → Registration form appears
- [ ] Complete registration → Account created
- [ ] Setup 2FA → QR code displays
- [ ] Scan 2FA → Login works
- [ ] Access dashboard → Admin panel loads

### Account Types
- [ ] Login as SITE_ADMIN → See all schools/users
- [ ] Create SCHOOL_ADMIN → Can manage one school
- [ ] Create TEACHER → Can create auctions, upload CSV
- [ ] Create STUDENT → Can see auctions, place bids
- [ ] Check role permissions → Match spec

### Database
- [ ] Connect via: `psql -h localhost -U postgres -d sag_db`
- [ ] Query users: `SELECT email, role FROM users;`
- [ ] Query auctions: `SELECT * FROM auctions;`
- [ ] Database persists after container restart

### API
- [ ] Test endpoints: `curl http://localhost:3000/api/auctions`
- [ ] Authentication: JWT token in header
- [ ] WebSocket: `ws://localhost:3000/ws` connects
- [ ] CORS headers present

### Security
- [ ] Passwords hashed (not plaintext)
- [ ] JWT tokens generated
- [ ] 2FA required
- [ ] XSS protection headers
- [ ] SQL injection prevention (parameterized queries)

### Logs
```bash
# View all logs
docker-compose logs -f

# View just app logs
docker-compose logs -f app

# View just database logs
docker-compose logs -f postgres
```

---

## 🎯 Testing Workflow

### Scenario 1: Test Role Hierarchy (10 min)

```bash
# Start containers
docker-compose up -d

# Create Super Admin
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"AdminPass123!","accountType":"teacher"}'

# Manually promote to SITE_ADMIN
# Connect to DB and run: UPDATE users SET role='SITE_ADMIN' WHERE email='admin@test.com';

# Login and verify can see all schools ✓
```

### Scenario 2: Test Teacher CSV Upload (15 min)

```bash
# 1. Create teacher account via browser
# 2. Go to http://localhost:3000/teacher-dashboard.html
# 3. Upload CSV with students:
#    Name,Email
#    John Smith,john@test.com
#    Jane Doe,jane@test.com
# 4. Verify registration links generated ✓
# 5. Click link as new user to register ✓
```

### Scenario 3: Test Auction Workflow (20 min)

```bash
# 1. Create teacher account
# 2. Upload student CSV
# 3. Create auction (teacher)
# 4. Approve auction (school admin)
# 5. Place bid as student
# 6. Verify bid updates in real-time ✓
# 7. Close auction and verify winner ✓
```

### Scenario 4: Run Full Test Suite (5 min)

```bash
npm test

# Outputs:
# - 450+ tests
# - 100% pass rate expected
# - Coverage metrics
# - No warnings or errors
```

---

## 🐳 Docker Compose Commands Reference

```bash
# Start containers (foreground - shows logs)
docker-compose up

# Start containers (background)
docker-compose up -d

# Build fresh image and start
docker-compose up --build

# Stop containers
docker-compose down

# Stop and remove volumes (careful - deletes data!)
docker-compose down -v

# View logs (all services)
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# Follow just app logs
docker-compose logs -f app

# View container status
docker-compose ps

# Execute command in container
docker-compose exec app npm test

# Execute command in database
docker-compose exec postgres psql -U postgres -d sag_db

# Restart services
docker-compose restart

# Remove stopped containers
docker-compose rm

# Pull latest images
docker-compose pull
```

---

## 🔍 Troubleshooting Local Testing

### Issue: "Port 3000 already in use"
```bash
# Find and stop other process
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Or use different port
docker-compose up --build -e PORT=3001
```

### Issue: "Cannot connect to PostgreSQL"
```bash
# Check if postgres container is running
docker-compose ps

# View postgres logs
docker-compose logs postgres

# Wait a bit longer (DB might still starting)
sleep 10 && curl http://localhost:3000
```

### Issue: "Node modules not installed"
```bash
# Rebuild image (includes npm install)
docker-compose build --no-cache

# Then restart
docker-compose up
```

### Issue: "Database schema not loaded"
```bash
# Check schema.sql exists
ls -lh schema.sql

# Rebuild and restart
docker-compose down -v
docker-compose up --build
```

### Issue: "Can't login after creating account"
```bash
# Check user created in DB
docker-compose exec postgres psql -U postgres -d sag_db -c "SELECT email, role FROM users;"

# Check app logs for errors
docker-compose logs app | tail -50
```

---

## 📈 Next Steps After Local Testing

### If Local Testing Works ✅
1. Run full test suite: `npm test`
2. Test admin workflows (create schools, users, etc.)
3. Test payment processing (use test keys)
4. Test WebSocket (real-time updates)
5. Then move to VPS deployment

### If Issues Found 🔧
1. Check logs: `docker-compose logs -f`
2. Review [TROUBLESHOOTING.md] (create if needed)
3. Fix issues locally
4. Re-test before moving to VPS

### VPS Deployment (When Ready)
I'll create:
1. `setup-vps.sh` - Automated VPS setup
2. `deploy.sh` - Easy deployment script
3. `.env.prod` - Production environment file
4. Monitoring/logging config
5. Health check endpoints

---

## 📋 Information I Still Need (For VPS)

When you're ready to move to VPS, I'll need:

```
Server Info:
- OS version (Ubuntu, CentOS, etc.)
- Is Docker installed? (docker --version)
- Available disk space (df -h)
- Available RAM (free -h)

Network Info:
- Development domain (sag-dev.example.com)
- Port to use (3000 is fine)
- HTTPS needed? (dev = no, staging = yes)

Database Info:
- Secure password (min 32 characters)
- Backup location
- Restore from existing data? (yes/no)

Environment Info:
- Email provider (test/smtp/disable)
- Payment test keys
- Any existing .env values to migrate?
```

---

## ✨ Summary

| Method | Time | Setup | Cost | Isolation |
|--------|------|-------|------|-----------|
| **Local Docker** | 5 min | Already ready ✓ | Free | Full |
| **Integration Tests** | 5 min | Ready ✓ | Free | Full |
| **VPS Staging** | 30 min | Need info | $5-10/mo | Shared |
| **Production** | 1 hour | Domain + SSL | $20-50/mo | Shared |

**Recommendation:** 
1. ✅ Start local testing NOW (15 minutes total)
2. ✅ Run tests to verify everything works
3. 🟡 Move to VPS when you have info ready
4. 🔵 Use same docker-compose.prod.yml on VPS

---

**Ready to test?** Run this command:
```bash
docker-compose up --build
```

Then open: **http://localhost:3000**

**Questions?** Check:
- DEPLOYMENT_GUIDE.md - Full deployment info
- Start logs with: `docker-compose logs -f`
- Database with: `docker-compose exec postgres psql -U postgres -d sag_db`

---

**Created:** February 4, 2026  
**Status:** ✅ Ready for immediate testing  
**Next:** Local testing recommended before VPS
