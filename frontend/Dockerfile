# Frontend Dockerfile - Optimized for Coolify
# Coolify provides frontend/ directory as the build context
#
# Build stage - compile React app with Vite
FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Using npm install instead of npm ci for monorepo workspace compatibility
RUN npm install

# Copy source code
COPY . ./

# Build arguments for Vite environment variables
ARG VITE_API_URL=/api
ARG VITE_APP_NAME=CogVeri

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

# Build the frontend
RUN npm run build

# Production stage - serve with nginx
FROM nginx:stable-alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
