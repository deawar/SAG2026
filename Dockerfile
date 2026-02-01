# Silent Auction Gallery - Multi-Stage Dockerfile
# Production-ready containerization with security best practices

# ============================================================================
# STAGE 1: BUILDER - Dependency installation and app preparation
# ============================================================================
FROM node:18-alpine AS builder

# Add build essentials for native modules
RUN apk add --no-cache python3 make g++ curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install --prefer-offline --no-audit

# Copy source code
COPY . .

# ============================================================================
# STAGE 2: RUNTIME - Slim production image
# ============================================================================
FROM node:18-alpine

# Metadata
LABEL maintainer="SAG2026 Development Team"
LABEL version="1.0"
LABEL description="Silent Auction Gallery - Admin Dashboard API"

# Install runtime dependencies only (curl for healthcheck)
RUN apk add --no-cache curl dumb-init

# Set working directory
WORKDIR /app

# Create logs directory (before changing user)
RUN mkdir -p logs

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production --no-audit 2>/dev/null || npm install --production --no-audit

# Copy built application from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/schema.sql ./

# Set permissions for node user
RUN chown -R node:node /app

# Expose port
EXPOSE 5000

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV PORT=5000

# Health check
# Checks if the application is healthy
# Interval: 30 seconds, Timeout: 3 seconds, Retries: 3
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/ || exit 1

# Use dumb-init to handle signals properly
# ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Change to non-root user for application execution
USER node

# Start application
CMD ["node", "src/index.js"]

# ============================================================================
# Build Instructions:
# ============================================================================
# Development build:
#   docker build -t sag2026:dev .
#
# Production build with tag:
#   docker build -t sag2026:latest .
#   docker tag sag2026:latest sag2026:1.0.0
#
# Multi-platform build:
#   docker buildx build --platform linux/amd64,linux/arm64 -t sag2026:latest .
#
# Scan image for vulnerabilities:
#   trivy image sag2026:latest
#
# ============================================================================
# Usage Instructions:
# ============================================================================
# Run container:
#   docker run -p 5000:5000 \
#     -e DATABASE_URL=postgresql://user:pass@db:5432/sag \
#     -e JWT_SECRET=your_secret \
#     sag2026:latest
#
# Run with environment file:
#   docker run -p 5000:5000 --env-file .env.production sag2026:latest
#
# Run in background:
#   docker run -d -p 5000:5000 --env-file .env.production sag2026:latest
#
# Check health:
#   docker ps  # Check if HEALTHY
#   curl http://localhost:5000/health
#
# View logs:
#   docker logs <container_id>
#   docker logs -f <container_id>  # Follow logs
#
# Execute command in running container:
#   docker exec -it <container_id> sh
#   docker exec <container_id> npm test
#
# ============================================================================
