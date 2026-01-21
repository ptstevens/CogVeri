# Staging Environment Setup Plan

## Overview

Set up a complete staging environment that mirrors production without affecting it.

| Component | Production | Staging |
|-----------|------------|---------|
| Frontend | cogveri.com (Vercel) | staging.cogveri.com (Vercel) |
| Backend API | api.cogveri.com | api-staging.cogveri.com |
| Database | PostgreSQL `postgres` | PostgreSQL `postgres_staging` |
| Redis | Prefix `relay:` | Prefix `relay-staging:` |

---

## Phase 1: Cloudflare DNS Setup (Free)

### 1.1 Add DNS Records

In Cloudflare Dashboard → DNS → Records:

```
Type    Name              Content                 Proxy
CNAME   staging           cname.vercel-dns.com    OFF (DNS only)
```

The `api-staging` subdomain will be handled by the Cloudflare Tunnel (next step).

---

## Phase 2: Backend Staging (Coolify)

### 2.1 Create Staging Database

SSH to server and create a new database:

```bash
ssh cogveri
sudo docker exec -it yc84w880s00084kw0ggsks0k psql -U postgres -c "CREATE DATABASE postgres_staging;"
```

### 2.2 Create New Coolify Application

In Coolify Dashboard:

1. **New Resource** → **Application** → **Docker Image** or **Git Repository**
2. Name: `cogveri-backend-staging`
3. Git Repository: Same repo, but branch: `staging`
4. Port: `3001` (different from production's 3000)

### 2.3 Staging Environment Variables

Set these in Coolify for the staging backend:

```env
# Core
NODE_ENV=production
PORT=3001

# Database - DIFFERENT database
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@yc84w880s00084kw0ggsks0k:5432/postgres_staging

# Redis - SAME server, different prefix
REDIS_HOST=v4oc0o8k44kcckk88sc4wgos
REDIS_PORT=6379
QUEUE_PREFIX=relay-staging

# URLs - Staging URLs
FRONTEND_URL=https://staging.cogveri.com
CORS_ORIGIN=https://staging.cogveri.com,https://api-staging.cogveri.com
COOKIE_DOMAIN=.cogveri.com

# Auth - Can use SAME secrets (tokens won't cross-contaminate due to different DBs)
JWT_SECRET=<same as production>
JWT_REFRESH_SECRET=<same as production>
CSRF_SECRET=<same as production>

# Storage - SAME R2 bucket but different prefix
AWS_ENDPOINT_URL=<same>
AWS_ACCESS_KEY_ID=<same>
AWS_SECRET_ACCESS_KEY=<same>
AWS_BUCKET_NAME=<same>
STORAGE_PREFIX=staging/

# Stripe - Use TEST mode keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (create new webhook for staging)
STRIPE_PRICE_ID_TEAM=price_test_...
STRIPE_PRICE_ID_BUSINESS=price_test_...

# Google OAuth - Create separate OAuth app OR reuse with additional redirect URI
GOOGLE_CLIENT_ID=<same or new>
GOOGLE_CLIENT_SECRET=<same or new>
GOOGLE_CALLBACK_URL=https://api-staging.cogveri.com/api/auth/google/callback

# Admin
SUPER_ADMIN_EMAIL=admin@cogveri.com
SUPER_ADMIN_PASSWORD=<staging password>

# Disable auto-wipe for staging (set true only when needed)
WIPE_DATABASE_ON_START=false
```

### 2.4 Cloudflare Tunnel for Staging API

Option A: **Add to existing tunnel** (Recommended - Free)

In Cloudflare Dashboard → Zero Trust → Tunnels → Your Tunnel → Configure:

Add a new public hostname:
```
Subdomain: api-staging
Domain: cogveri.com
Service: http://cogveri-backend-staging:3001
```

Option B: **Create separate tunnel** (if you want full isolation)

```bash
ssh cogveri
cloudflared tunnel create cogveri-staging
# Configure to route api-staging.cogveri.com → localhost:3001
```

---

## Phase 3: Frontend Staging (Vercel Free Plan)

### 3.1 Create New Vercel Project

Vercel free plan allows **unlimited projects**. Create a new one:

1. Go to Vercel Dashboard → **Add New** → **Project**
2. Import same Git repository
3. **Root Directory**: `frontend`
4. **Framework Preset**: Vite
5. **Build Command**: `npm run build`
6. **Output Directory**: `dist`

### 3.2 Configure Git Branch

In Project Settings → Git:
- **Production Branch**: `staging` (not main!)

This means pushes to `staging` branch deploy to this project.

### 3.3 Environment Variables

In Project Settings → Environment Variables:

```env
VITE_API_URL=https://api-staging.cogveri.com/api
VITE_APP_ENVIRONMENT=staging
VITE_SOCKET_URL=https://api-staging.cogveri.com
```

### 3.4 Custom Domain

In Project Settings → Domains:
- Add `staging.cogveri.com`
- Vercel will provide verification instructions
- Since we added CNAME in Cloudflare, it should verify automatically

---

## Phase 4: Google OAuth Setup

### Option A: Reuse Same OAuth App (Simpler)

In Google Cloud Console → APIs & Services → Credentials → Your OAuth Client:

Add additional **Authorized redirect URIs**:
```
https://api-staging.cogveri.com/api/auth/google/callback
```

### Option B: Create Separate OAuth App (Cleaner)

Create a new OAuth 2.0 Client ID specifically for staging with its own credentials.

---

## Phase 5: Stripe Webhook (Test Mode)

1. In Stripe Dashboard, switch to **Test Mode**
2. Developers → Webhooks → Add Endpoint:
   - URL: `https://api-staging.cogveri.com/api/billing/webhook`
   - Events: Same as production
3. Copy the signing secret to `STRIPE_WEBHOOK_SECRET` in staging env

---

## Phase 6: Database Migration

After backend is deployed, run migrations on staging:

```bash
ssh cogveri
sudo docker exec -it <staging-container-id> npm run db:migrate
```

Or trigger via Coolify's deployment script.

---

## Deployment Workflow

```
Feature Branch → staging branch → Staging Environment (test)
                      ↓
              main branch → Production Environment (live)
```

### Deploy to Staging
```bash
git checkout staging
git merge feature-branch
git push origin staging
# Coolify auto-deploys backend
# Vercel auto-deploys frontend
```

### Promote to Production
```bash
git checkout main
git merge staging
git push origin main
# Coolify auto-deploys backend (if configured)
# Vercel auto-deploys frontend (separate project)
```

---

## Cost Summary

| Service | Free Tier Includes | Staging Cost |
|---------|-------------------|--------------|
| Vercel | Unlimited projects, 100GB bandwidth | **$0** |
| Cloudflare | Unlimited DNS, 1 tunnel with multiple routes | **$0** |
| Coolify | Self-hosted, unlimited apps | **$0** (same server) |
| PostgreSQL | Self-hosted | **$0** (same server) |
| Redis | Self-hosted | **$0** (same server, different prefix) |
| Google OAuth | Free | **$0** |
| Stripe Test Mode | Free | **$0** |

**Total Additional Cost: $0**

---

## Resource Usage Considerations

Running staging on the same server as production:
- **CPU/Memory**: Backend staging will use additional resources
- **Disk**: Staging database will grow over time
- **Recommendation**: Periodically wipe staging DB to keep resources low

```bash
# Wipe staging database (run when needed)
ssh cogveri
sudo docker exec -it <staging-container> npm run db:reset:dev
```

---

## Quick Reference

| Environment | Frontend URL | API URL | Branch |
|-------------|--------------|---------|--------|
| Production | cogveri.com | api.cogveri.com | main |
| Staging | staging.cogveri.com | api-staging.cogveri.com | staging |

---

## Implementation Checklist

- [ ] Add Cloudflare DNS record for `staging`
- [ ] Create staging database in PostgreSQL
- [ ] Create new Coolify application for staging backend
- [ ] Configure staging environment variables in Coolify
- [ ] Add api-staging route to Cloudflare Tunnel
- [ ] Create new Vercel project for staging frontend
- [ ] Set staging branch as production branch in Vercel
- [ ] Add staging environment variables in Vercel
- [ ] Add staging.cogveri.com domain to Vercel
- [ ] Add staging OAuth redirect URI to Google
- [ ] Create Stripe test webhook for staging
- [ ] Run database migrations on staging
- [ ] Test full login flow on staging
