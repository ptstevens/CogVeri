# Backend Dockerfile - Optimized for Coolify
# Coolify provides backend/ directory as the build context
# Cache bust: 2026-01-13
# Therefore: . = backend/, so we don't need "backend/" prefix in paths
#
# SECURITY NOTE: Do NOT pass secrets as build-time ARGs!
# In Coolify, mark these as "Runtime only" (uncheck "Available at Buildtime"):
# - JWT_SECRET, JWT_REFRESH_SECRET
# - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# - AWS_SECRET_ACCESS_KEY, AWS_ACCESS_KEY_ID
# - DATABASE_URL, REDIS_PASSWORD
# - GOOGLE_CLIENT_SECRET, GEMINI_API_KEY
# - SUPER_ADMIN_PASSWORD, BACKEND_API_KEY
# - EMAIL_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN
# Build-time ARGs are baked into image layers and visible in `docker history`

# Use Node.js 20 LTS for better performance and security
# Pinned to SHA256 digest for reproducible builds and supply chain security
FROM node:20-alpine@sha256:3960ed74dfe320a67bf8da9555b6bade25ebda2b22b6081d2f60fd7d5d430e9c AS builder

WORKDIR /app

# Copy backend package files directly (since context is backend/)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
# Note: Using npm install instead of npm ci because this is a monorepo workspace
# and the package-lock.json is at the root level, not in the backend directory
# IMPORTANT: Override NODE_ENV to ensure devDependencies are installed
# (Coolify passes NODE_ENV=production as build arg which would skip devDeps)
RUN NODE_ENV=development npm install

# Copy source code and configuration files (since context is backend/)
COPY . ./

# Build the backend
RUN npm run build

# Compile TypeScript migrations to JavaScript
RUN npx tsc --project tsconfig.migrations.json

# Compile knexfile.ts to knexfile.js
RUN npx tsc --target es2022 --module commonjs --esModuleInterop --skipLibCheck knexfile.ts

# Production stage - minimal image
# Pinned to SHA256 digest for reproducible builds and supply chain security
FROM node:20-alpine@sha256:3960ed74dfe320a67bf8da9555b6bade25ebda2b22b6081d2f60fd7d5d430e9c

# Install curl for health checks and ffmpeg for video frame extraction
RUN apk add --no-cache curl ffmpeg

WORKDIR /app/backend

# Copy production package files
COPY package*.json ./

# Install production dependencies only
# Use npm install to ensure compatibility with the lock file created in builder stage
RUN npm install --omit=dev

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Copy knexfile for migrations
COPY --from=builder /app/knexfile.js ./

# Copy migration and seed runner scripts
COPY --from=builder /app/run-migrations.js ./
COPY --from=builder /app/run-seeds.js ./
COPY --from=builder /app/run-reset-prod.js ./
COPY --from=builder /app/scripts ./scripts

# Verify migrations directory exists and contains migrations
RUN ls -la dist/migrations/ && test -d dist/migrations || (echo "ERROR: Migrations directory not found!" && exit 1)

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Change ownership to non-root
RUN chown -R nodejs:nodejs /app/backend

USER nodejs

EXPOSE 3000

# Health check - uses PORT env var with fallback to 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Copy startup script (already executable from builder stage)
COPY --from=builder /app/startup.sh ./

# Start application with intelligent seed handling
CMD ["./startup.sh"]
