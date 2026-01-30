# Section 9: Deployment & Testing - Complete Guide

**Status**: Production-Ready  
**Last Updated**: January 30, 2026  
**Version**: 1.0  

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Docker Setup](#docker-setup)
4. [Docker Compose](#docker-compose)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Deployment](#deployment)
7. [Testing](#testing)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)
10. [References](#references)

---

## Overview

Section 9 provides complete containerization, orchestration, and deployment infrastructure for the Silent Auction Gallery. This enables:

- **Consistent Development Environment**: Docker ensures dev/staging/prod parity
- **Automated Testing**: GitHub Actions runs tests on every commit
- **Continuous Deployment**: Auto-deploy on merge to main/develop
- **Rollback Capability**: Quickly revert to previous versions
- **Monitoring & Alerts**: Health checks and error tracking
- **Security Scanning**: Automated vulnerability detection

### Key Components

| Component | Purpose |
|-----------|---------|
| Dockerfile | Multi-stage production-ready image |
| docker-compose.yml | Development environment with live reload |
| docker-compose.prod.yml | Production environment with optimization |
| GitHub Actions | CI/CD pipeline automation |
| Bash Scripts | Deployment, rollback, health checks |
| Environment Files | Configuration management |
| Nginx | Reverse proxy and SSL termination |

---

## Quick Start

### Option 1: Using Docker Compose (Recommended for Development)

```bash
# Install Docker & Docker Compose
# https://docs.docker.com/get-docker/

# Clone repository
git clone <repo-url>
cd Silent-Auction-Gallery

# Copy environment template
cp .env.example .env

# Start all services
docker-compose up

# Access application
# App:     http://localhost:5000
# pgAdmin: http://localhost:5050
# Redis:   localhost:6379
```

### Option 2: Using Deployment Script

```bash
# Make script executable
chmod +x scripts/deploy.sh

# Deploy to staging
./scripts/deploy.sh staging

# Or production
./scripts/deploy.sh production
```

### Option 3: Manual Docker Run

```bash
# Build image
docker build -t sag2026:latest .

# Run container
docker run -d \
  -p 5000:5000 \
  --env-file .env \
  --name sag-app \
  sag2026:latest

# Check logs
docker logs -f sag-app

# Check health
curl http://localhost:5000/health
```

---

## Docker Setup

### Dockerfile Overview

**Multi-Stage Build Process**:

```
Stage 1: Builder (800MB)
├─ Node.js 18 with build tools
├─ Install all dependencies
├─ Run linting
├─ Run unit tests
├─ Run integration tests
└─ Generate coverage reports

Stage 2: Runtime (150MB)
├─ Node.js 18-alpine (slim)
├─ Copy production dependencies only
├─ Copy application code
├─ Copy public assets
├─ Create non-root user
└─ Setup healthcheck
```

### Security Features

- **Non-root user** (node:1000): Prevents privilege escalation
- **Minimal base image** (alpine): Reduces attack surface
- **Read-only filesystem**: Prevents file tampering
- **No dev dependencies**: Removes potential vulnerabilities
- **Health checks**: Automatic restart if unhealthy

### Building Images

```bash
# Development build
docker build -t sag2026:dev .

# Production build with tag
docker build -t sag2026:1.0.0 .

# Multi-platform build (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t sag2026:latest .

# Scan image for vulnerabilities
docker scan sag2026:latest
trivy image sag2026:latest
```

### Image Variants

| Variant | Size | Use Case | Base Image |
|---------|------|----------|-----------|
| Development | ~800MB | Local development | node:18-alpine |
| Production | ~150MB | Deployment | node:18-alpine |
| Testing | ~700MB | CI/CD | node:18-alpine |

---

## Docker Compose

### Development Environment

**File**: `docker-compose.yml`

**Services**:
```
app      → Node.js application (port 5000)
postgres → PostgreSQL database (port 5432)
redis    → Redis cache (port 6379)
pgadmin  → Database UI (port 5050)
```

**Features**:
- Live code reload (source volume mounts)
- Automatic database initialization
- pgAdmin for database exploration
- Redis for caching
- Health checks on all services
- Automatic restart

**Commands**:

```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f app

# Run tests in container
docker-compose exec app npm test

# Access database
docker-compose exec postgres psql -U postgres

# Stop services
docker-compose down

# Remove volumes
docker-compose down -v

# Rebuild images
docker-compose up --build
```

### Production Environment

**File**: `docker-compose.prod.yml`

**Services**:
```
app      → Node.js application (port 5000)
postgres → PostgreSQL database (internal only)
redis    → Redis cache (internal only)
nginx    → Reverse proxy (ports 80, 443)
```

**Optimizations**:
- No live reload volumes
- Resource limits enforced
- Healthchecks enabled
- Nginx reverse proxy
- SSL/TLS termination
- Logging configured
- Database backups

**Commands**:

```bash
# Start production environment
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Stop services
docker-compose -f docker-compose.prod.yml down

# Backup database
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres sag_db > backup.sql
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### 1. Lint & Code Quality (`lint.yml`)

**Triggers**: Every push and PR  
**Duration**: ~2 minutes

**Steps**:
1. Checkout code
2. Setup Node.js 18
3. Install dependencies
4. Run ESLint
5. Check code formatting
6. Validate dependencies
7. Count lines of code

**Success Criteria**: No linting errors

#### 2. Unit & Integration Tests (`test.yml`)

**Triggers**: Every push and PR  
**Duration**: ~10 minutes  
**Database**: PostgreSQL service with schema

**Steps**:
1. Setup Node.js (tests on 18.x and 20.x)
2. Start PostgreSQL service
3. Load database schema
4. Run unit tests
5. Run integration tests
6. Generate coverage reports
7. Upload to Codecov

**Success Criteria**: All tests passing, coverage >80%

#### 3. Security Scanning (`security.yml`)

**Triggers**: Every push, PRs, nightly schedule  
**Duration**: ~5 minutes

**Checks**:
1. npm audit (dependencies)
2. Snyk (vulnerabilities)
3. OWASP Dependency-Check
4. License validation
5. Known CVE scanning

**Success Criteria**: No critical/high vulnerabilities

#### 4. Docker Build & Deploy (`deploy.yml`)

**Triggers**: Push to main/develop, version tags  
**Duration**: ~15 minutes

**Jobs**:
1. Build (multi-platform: amd64, arm64)
2. Scan (Trivy, Grype vulnerability scanning)
3. Deploy to Staging (on develop)
4. Deploy to Production (on main)

**Features**:
- Multi-platform Docker build
- Docker registry scanning
- Automatic deployment
- Smoke tests
- Slack notifications
- Automatic rollback on failure

### Secrets Configuration

Add to GitHub repository settings:

```
DOCKER_USERNAME              # Docker Hub user
DOCKER_PASSWORD              # Docker Hub password
POSTGRES_PASSWORD            # Database password
JWT_SECRET                   # JWT signing secret
DATABASE_URL                 # Prod connection string
SLACK_WEBHOOK                # Slack notifications
STAGING_HOST                 # Staging server
STAGING_USER                 # Staging SSH user
STAGING_SSH_KEY              # Staging SSH key
STAGING_APP_DIR              # Staging app directory
PROD_HOST                    # Production server
PROD_USER                    # Production SSH user
PROD_SSH_KEY                 # Production SSH key
PROD_APP_DIR                 # Production directory
SNYK_TOKEN                   # Snyk vulnerability scanning
```

### Workflow Status Badges

Add to README.md:

```markdown
[![Lint](https://github.com/user/repo/actions/workflows/lint.yml/badge.svg)](https://github.com/user/repo/actions)
[![Tests](https://github.com/user/repo/actions/workflows/test.yml/badge.svg)](https://github.com/user/repo/actions)
[![Security](https://github.com/user/repo/actions/workflows/security.yml/badge.svg)](https://github.com/user/repo/actions)
[![Deploy](https://github.com/user/repo/actions/workflows/deploy.yml/badge.svg)](https://github.com/user/repo/actions)
```

---

## Deployment

### Deployment Script

**File**: `scripts/deploy.sh`

```bash
# Make executable
chmod +x scripts/deploy.sh

# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production
```

**What It Does**:
1. Validates Docker installation
2. Loads environment variables
3. Backs up database
4. Stops old services
5. Pulls/builds Docker image
6. Starts new services
7. Runs health checks
8. Performs smoke tests
9. Generates deployment report

### Rollback Script

**File**: `scripts/rollback.sh`

```bash
# Make executable
chmod +x scripts/rollback.sh

# Rollback to specific version
./scripts/rollback.sh 1.0.0

# Rollback to latest
./scripts/rollback.sh latest
```

**Rollback Process**:
1. Stops current services
2. Pulls previous image version
3. Starts services with old image
4. Runs health checks
5. Verifies rollback success

### Manual Deployment

```bash
# Build and push to registry
docker build -t docker.io/youruser/sag2026:1.0.0 .
docker push docker.io/youruser/sag2026:1.0.0

# SSH to production server
ssh user@prod-server

# Pull latest image
docker pull docker.io/youruser/sag2026:latest

# Update docker-compose.prod.yml
nano docker-compose.prod.yml

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Verify
curl http://localhost/health
```

### Zero-Downtime Deployment

**Blue-Green Strategy**:
```
1. Deploy new version to "green" environment
2. Run tests in green environment
3. Switch load balancer from blue to green
4. Keep blue as fallback for X minutes
5. Promote green, retire blue
```

---

## Testing

### Local Testing

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage

# Watch mode (development)
npm run test:watch
```

### CI Testing

Tests run automatically on:
- Every git push
- Every pull request
- Nightly security scans

**Coverage Targets**:
- Statements: >85%
- Branches: >80%
- Functions: >85%
- Lines: >85%

### Test Database

Separate test database automatically created:

```sql
CREATE DATABASE sag_test;
```

Tests run in isolation with:
- Fresh schema per test
- Transaction rollback
- Fixture cleanup

---

## Monitoring

### Health Endpoint

```bash
curl http://localhost:5000/health

# Response
{
  "status": "healthy",
  "timestamp": "2026-01-30T10:00:00Z",
  "uptime": 3600,
  "checks": {
    "database": "ok",
    "redis": "ok",
    "memory": { "used": 120, "total": 512, "percent": 23 },
    "cpu": 45
  }
}
```

### Docker Healthcheck

```bash
# Check container health
docker ps

# View healthcheck logs
docker inspect --format='{{json .State.Health}}' sag-app

# Manual healthcheck
docker exec sag-app curl -f http://localhost:5000/health
```

### Logs

```bash
# View application logs
docker logs sag-app

# Follow logs (tail -f)
docker logs -f sag-app

# View logs since specific time
docker logs --since 30m sag-app

# Save logs to file
docker logs sag-app > app-logs.txt

# View container resource usage
docker stats sag-app
```

### Monitoring Solutions

Optional integrations:
- **Sentry**: Error tracking
- **New Relic**: APM monitoring
- **DataDog**: Infrastructure monitoring
- **Prometheus**: Metrics collection
- **ELK Stack**: Logging (Elasticsearch, Logstash, Kibana)

---

## Troubleshooting

### Docker Issues

**Container won't start**:
```bash
# Check logs
docker logs sag-app

# Inspect container
docker inspect sag-app

# Check healthcheck
docker ps | grep sag-app

# Rebuild image
docker build --no-cache -t sag2026:latest .
```

**Permission denied**:
```bash
# Run with sudo
sudo docker-compose up

# Or add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

**Port already in use**:
```bash
# Find process using port
lsof -i :5000

# Change port in docker-compose.yml
ports:
  - "5001:5000"

# Or stop conflicting service
sudo kill -9 <PID>
```

### Database Issues

**Cannot connect to database**:
```bash
# Check if postgres is running
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres

# Restart postgres
docker-compose restart postgres
```

**Database migration failed**:
```bash
# Check migration status
docker-compose exec postgres psql -U postgres -d sag_db -c "\dt"

# Manually run schema
docker-compose exec postgres psql -U postgres -d sag_db -f schema.sql

# Restore from backup
cat backup.sql | docker-compose exec -T postgres psql -U postgres
```

### Test Issues

**Tests failing locally but passing in CI**:
```bash
# Run tests in Docker environment
docker-compose exec app npm test

# Check for port conflicts
lsof -i :5432

# Verify database is initialized
docker-compose exec postgres psql -U postgres -l
```

**Coverage report issues**:
```bash
# Clear coverage cache
rm -rf coverage

# Regenerate coverage
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Deployment Issues

**Deployment script fails**:
```bash
# Enable debug mode
set -x  # in script

# Check environment variables
env | grep DATABASE

# Verify compose file
docker-compose -f docker-compose.prod.yml config

# Test health endpoint manually
curl http://localhost:5000/health
```

**Rollback failed**:
```bash
# Check available image versions
docker images sag2026

# Manual rollback
docker-compose -f docker-compose.prod.yml down
docker pull sag2026:previous-version
docker tag sag2026:previous-version sag2026:latest
docker-compose -f docker-compose.prod.yml up -d
```

---

## Best Practices

### Development

✓ Use docker-compose for local development  
✓ Mount source code for live reload  
✓ Use separate test database  
✓ Enable debug logging  
✓ Test with real services (postgres, redis)  

### Production

✓ Use docker-compose.prod.yml  
✓ Set NODE_ENV=production  
✓ Use strong secrets (change all defaults)  
✓ Enable HTTPS/SSL  
✓ Setup monitoring and alerts  
✓ Regular database backups  
✓ Test rollback procedure  
✓ Document deployment process  

### Security

✓ Scan images for vulnerabilities  
✓ Keep base images updated  
✓ Use secrets management  
✓ Enable authentication on all services  
✓ Use read-only filesystems where possible  
✓ Implement rate limiting  
✓ Enable security headers  
✓ Regular security audits  

### Monitoring

✓ Check health endpoints regularly  
✓ Monitor resource usage  
✓ Setup error alerts  
✓ Review logs regularly  
✓ Track deployment success rate  
✓ Monitor database performance  
✓ Alert on high error rates  

---

## References

### Official Documentation

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

### Tools & Services

- [Docker Hub](https://hub.docker.com/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Trivy Vulnerability Scanner](https://github.com/aquasecurity/trivy)
- [Snyk Security Scanning](https://snyk.io/)

### Learning Resources

- [The Twelve-Factor App](https://12factor.net/)
- [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Kubernetes Basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/) (future)

---

## Section 9 Deliverables

### Configuration Files ✅
- [x] Dockerfile (multi-stage production build)
- [x] .dockerignore (optimized image size)
- [x] docker-compose.yml (development environment)
- [x] docker-compose.prod.yml (production environment)
- [x] .env.example (environment template)

### CI/CD Workflows ✅
- [x] lint.yml (code quality checks)
- [x] test.yml (automated testing)
- [x] security.yml (vulnerability scanning)
- [x] deploy.yml (Docker build & deployment)

### Deployment Scripts ✅
- [x] deploy.sh (automated deployment)
- [x] rollback.sh (rollback procedure)
- [x] health-check.sh (health verification)
- [x] backup-db.sh (database backups)

### Documentation ✅
- [x] SECTION_9_README.md (this file)
- [x] SECTION_9_PLAN.md (detailed plan)
- [ ] SECTION_9_COMPLETION_REPORT.md (metrics & validation)

---

**Section 9 Status**: ✅ Implementation Complete (98% - Documentation Pending)

**Estimated Time to Complete**: 30 minutes remaining (completion report)

**Project Progress**: 8/14 → 9/14 (64%)
