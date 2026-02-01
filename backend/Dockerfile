# syntax=docker/dockerfile:1.4
# Backend Dockerfile - Optimized for Coolify with BuildKit caching
# Coolify provides backend/ directory as the build context
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
FROM node:25-alpine@sha256:f741690269ee7abb07675cb744f0b66ec117b482d89d9565a36f2360d5e2a3ef AS builder

WORKDIR /app

# Copy backend package files directly (since context is backend/)
COPY package*.json ./

# Install ALL dependencies with BuildKit cache mount
# --mount=type=cache persists npm cache across builds (even when layers invalidate)
# This dramatically speeds up builds when Coolify injects ARGs that bust the cache
RUN --mount=type=cache,target=/root/.npm \
    NODE_ENV=development npm install

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
FROM node:25-alpine@sha256:f741690269ee7abb07675cb744f0b66ec117b482d89d9565a36f2360d5e2a3ef

# Install curl for health checks and ffmpeg for video frame extraction
RUN apk add --no-cache curl ffmpeg

WORKDIR /app/backend

# Copy production package files
COPY package*.json ./

# Install production dependencies with BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

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
