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
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY . .

# Run linting
RUN npm run lint 2>&1 | tee /tmp/lint.log || true

# Run unit tests
RUN npm run test:unit 2>&1 | tee /tmp/test.log || true

# Run integration tests
RUN npm run test:integration 2>&1 | tee /tmp/integration.log || true

# Generate coverage reports
RUN npm run test:coverage 2>&1 | tee /tmp/coverage.log || true

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

# Create non-root user for security
RUN addgroup -g 1000 node && \
    adduser -u 1000 -G node -s /bin/sh -D node

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --prefer-offline --no-audit --production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/schema.sql ./
COPY --from=builder /app/jest.config.js ./
COPY --from=builder /app/.env.example ./

# Copy test reports for documentation
COPY --from=builder /tmp/lint.log ./logs/ || true
COPY --from=builder /tmp/test.log ./logs/ || true
COPY --from=builder /tmp/coverage.log ./logs/ || true

# Create logs directory
RUN mkdir -p logs && chown -R node:node /app

# Change to non-root user
USER node

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
  CMD curl -f http://localhost:5000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

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
