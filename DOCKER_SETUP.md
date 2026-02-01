# Docker Setup & Configuration Guide

**Date**: January 31, 2026  
**Project**: Silent Auction Gallery (SAG)  
**Status**: Docker Deployment Ready ✅

---

## 🐳 Docker Setup Complete

All Docker configuration has been successfully implemented and tested. The application is ready for containerized deployment.

### ✅ What's Ready

1. **Dockerfile** - Multi-stage production build
   - Builder stage: Installs dependencies, builds application
   - Runtime stage: Lean production image with security hardening
   - Non-root user execution
   - Health checks enabled

2. **docker-compose.yml** - Development environment
   - PostgreSQL database (with schema auto-init)
   - Redis caching layer
   - pgAdmin for database management
   - Node.js application
   - All services with health checks

3. **docker-compose.prod.yml** - Production environment
   - Optimized for cloud deployment
   - Environment-based configuration
   - Backup scripts included
   - Rollback capability

4. **GitHub Actions CI/CD** - Fully automated deployment
   - Lint workflow (2 min)
   - Test workflow (10 min)
   - Security workflow (5 min)
   - Deploy workflow (15 min)

---

## 🚀 Quick Start

### Local Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Staging Deployment
```bash
# Deploy via GitHub Actions
# Trigger: Push to `develop` branch
# Auto-deploys to staging environment
```

### Production Deployment
```bash
# Deploy via GitHub Actions
# Trigger: Push to `main` branch
# Manual approval required
# Auto-deploys to production with backup
```

---

## 🔑 Required GitHub Secrets

Add these secrets to your GitHub repository settings (`Settings > Secrets > Actions`):

| Secret | Value | Purpose |
|--------|-------|---------|
| `DOCKER_USERNAME` | Your Docker Hub username | Docker Hub login |
| `DOCKER_PASSWORD` | Docker Hub PAT (not password) | Docker Hub authentication |
| `STAGING_HOST` | Your staging server IP/hostname | Staging deployment |
| `STAGING_USER` | SSH user for staging | Staging deployment |
| `STAGING_SSH_KEY` | Private SSH key | Staging SSH access |
| `STAGING_APP_DIR` | App directory path | Staging deployment path |
| `PROD_HOST` | Your production server IP/hostname | Production deployment |
| `PROD_USER` | SSH user for production | Production deployment |
| `PROD_SSH_KEY` | Private SSH key | Production SSH access |
| `PROD_APP_DIR` | App directory path | Production deployment path |
| `DATABASE_USER` | PostgreSQL user | Database access |
| `DATABASE_NAME` | Database name | Database name |
| `SLACK_WEBHOOK` | Slack webhook URL | Deployment notifications |

---

## 🔐 Environment Variables

### Development (.env)
```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=sag_db
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=refresh_secret_key

# TOTP
TOTP_ISSUER=SAG2026
TOTP_WINDOW=1

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
```

### Production (.env.production)
```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (use RDS/managed database)
DATABASE_HOST=db.example.com
DATABASE_PORT=5432
DATABASE_NAME=sag_prod
DATABASE_USER=sag_admin
DATABASE_PASSWORD=secure_password_here

# JWT
JWT_SECRET=generate_long_random_string_here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=another_long_random_string

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=sendgrid_api_key

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...
```

---

## 🔧 Docker Build Options

### Build for development
```bash
docker build -t sag2026:dev .
```

### Build for production
```bash
docker build -t sag2026:latest .
docker tag sag2026:latest sag2026:1.0.0
```

### Multi-platform build
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t sag2026:latest .
```

### Push to Docker Hub
```bash
docker tag sag2026:latest deawar/sag2026:latest
docker push deawar/sag2026:latest
```

---

## 📋 Docker Commands Reference

### View running containers
```bash
docker-compose ps
```

### View container logs
```bash
docker-compose logs app
docker-compose logs -f app          # Follow logs
docker-compose logs --tail 50 app   # Last 50 lines
```

### Execute commands in container
```bash
docker-compose exec app npm test
docker-compose exec app npm run lint
docker-compose exec postgres psql -U postgres -d sag_db
```

### Access container shell
```bash
docker-compose exec app sh
docker-compose exec postgres bash
```

### Clean up
```bash
docker-compose down              # Stop and remove containers
docker-compose down -v           # Also remove volumes
docker system prune -a           # Remove unused images/containers
```

---

## 🏥 Health Checks

All services have health checks configured:

### Check service health
```bash
docker-compose ps
```

Look for `(healthy)` status:
```
CONTAINER      STATUS
app            Up 2 minutes (healthy)
postgres       Up 2 minutes (healthy)
redis          Up 2 minutes (healthy)
```

### Manual health check
```bash
# Application
curl http://localhost:3000/

# PostgreSQL
docker-compose exec postgres pg_isready -U postgres

# Redis
docker-compose exec redis redis-cli ping
```

---

## 🚨 Troubleshooting

### Container fails to start
```bash
# View error logs
docker-compose logs app

# Check resources
docker stats

# Rebuild image
docker-compose up --build
```

### Database connection fails
```bash
# Verify database is running
docker-compose ps postgres

# Check connection
docker-compose exec postgres psql -U postgres -d sag_db

# View database logs
docker-compose logs postgres
```

### Port already in use
```bash
# Check what's using the port
netstat -ano | findstr :3000

# Change port in docker-compose.yml
# Then: docker-compose up
```

### Out of disk space
```bash
# Clean up Docker resources
docker system prune -a

# Remove specific images
docker image rm silent-auction-gallery-app
```

---

## 📦 CI/CD Workflow

### 1. Code Push
```bash
git push origin develop  # → Triggers staging deployment
git push origin main     # → Triggers production deployment (manual approval)
```

### 2. GitHub Actions
```
Lint → Test → Security → Build → Scan → Deploy
```

### 3. Deployment Steps
- ✅ Lint code (ESLint)
- ✅ Run tests (Jest)
- ✅ Security scan (npm audit + Snyk)
- ✅ Build Docker image
- ✅ Scan vulnerabilities (Trivy + Grype)
- ✅ Deploy to staging/production
- ✅ Run smoke tests
- ✅ Send Slack notification

---

## 🔐 Security Best Practices

1. ✅ Never commit `.env` files
2. ✅ Use GitHub Secrets for sensitive data
3. ✅ Keep Docker images updated
4. ✅ Run vulnerability scans (Trivy, Grype)
5. ✅ Use non-root user in containers
6. ✅ Implement health checks
7. ✅ Use secrets management for production
8. ✅ Enable HTTPS/TLS in production

---

## 📚 Resources

- [Docker Documentation](https://docs.docker.com/)
- [docker-compose Reference](https://docs.docker.com/compose/compose-file/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Trivy Vulnerability Scanner](https://github.com/aquasecurity/trivy)

---

## Status Summary

| Item | Status |
|------|--------|
| Dockerfile | ✅ Production-ready |
| docker-compose | ✅ Development-ready |
| docker-compose.prod | ✅ Production-ready |
| GitHub Actions | ✅ Fully automated |
| Health checks | ✅ Configured |
| Security scanning | ✅ Enabled |
| Deployment scripts | ✅ Ready |

**Overall Status**: 🟢 READY FOR PRODUCTION

---

*Last Updated*: January 31, 2026  
*Project*: Silent Auction Gallery (SAG)  
*Status*: Docker Deployment Ready ✅
