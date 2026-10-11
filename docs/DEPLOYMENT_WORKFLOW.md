# Deployment Workflow

## Overview

This document outlines the staging → production deployment workflow for CogVeri.

## Goal

- **Staging server**: Test changes before production
- **Production server**: Live site with rolling updates (zero downtime)
- **Automated deployments**: Push to branch → auto-deploy

## Git Branching Strategy

```
feature/xyz → staging → main
                ↓          ↓
           Staging     Production
            Server       Server
```

### Workflow

1. Develop on feature branches
2. Merge to `staging` branch → auto-deploys to staging server
3. Test on staging
4. If good, merge `staging` → `main` → auto-deploys to production (rolling update)

## Coolify Configuration

### Two Separate Applications

| Setting             | Staging                   | Production           |
| ------------------- | ------------------------- | -------------------- |
| Branch              | `staging`                 | `main`               |
| Domain              | `staging-api.cogveri.com` | `api.cogveri.com`    |
| Database            | Separate staging DB       | Production DB        |
| `NODE_ENV`          | `staging`                 | `production`         |
| `OPEN_FOR_BUSINESS` | `true`                    | `true` when launched |
| Rolling updates     | ✅ Enabled                | ✅ Enabled           |

### Enabling Rolling Updates

To enable rolling updates in Coolify, you must:

1. **Remove host port mapping**
   - Don't use `3000:3000` style mappings
   - Just set "Exposed Port" (e.g., `3000`)
   - Let Traefik proxy handle routing

2. **Remove custom internal name**
   - Clear the "Custom Internal Name" field
   - Let Coolify auto-generate container names

This allows Coolify to:

1. Start new container with new code
2. Health check it
3. Switch traffic to new container
4. Stop old container
5. = Zero downtime deployment

## Setup Steps

### 1. Create Staging Branch

```bash
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```

### 2. Configure Coolify - Staging App

1. In Coolify, create new application (or duplicate existing)
2. Set repository branch to `staging`
3. Set domain to `staging-api.cogveri.com`
4. Configure environment variables:
   ```
   NODE_ENV=staging
   DATABASE_URL=<staging-database-url>
   OPEN_FOR_BUSINESS=true
   # ... other staging-specific vars
   ```
5. Remove port mappings (for rolling updates)
6. Remove custom internal name (for rolling updates)
7. Enable auto-deploy on push

### 3. Configure Coolify - Production App

1. Ensure branch is set to `main`
2. Domain: `api.cogveri.com`
3. Configure production environment variables
4. Remove port mappings (for rolling updates)
5. Remove custom internal name (for rolling updates)
6. Enable auto-deploy on push

### 4. DNS Setup

Add DNS records:

- `staging-api.cogveri.com` → Coolify server IP
- `api.cogveri.com` → Coolify server IP (if not already done)

## Daily Development Workflow

### Starting New Work

```bash
# Always start from latest staging
git checkout staging
git pull origin staging

# Create feature branch
git checkout -b feature/my-new-feature
```

### During Development

```bash
# Regular commits
git add .
git commit -m "Description of changes"

# Push to remote
git push -u origin feature/my-new-feature
```

### Ready to Test on Staging

Option A: Create PR on GitHub

1. Go to GitHub
2. Create Pull Request: `feature/my-new-feature` → `staging`
3. Review and merge
4. Coolify auto-deploys to staging

Option B: Merge locally

```bash
git checkout staging
git pull origin staging
git merge feature/my-new-feature
git push origin staging
# Coolify auto-deploys to staging
```

### Testing on Staging

1. Wait for Coolify deployment to complete
2. Test at `https://staging-api.cogveri.com`
3. Also test frontend pointing to staging API if applicable

### Promoting to Production

Once staging is verified:

Option A: Create PR on GitHub

1. Create Pull Request: `staging` → `main`
2. Review and merge
3. Coolify auto-deploys to production with rolling update

Option B: Merge locally

```bash
git checkout main
git pull origin main
git merge staging
git push origin main
# Coolify auto-deploys to production
```

## Rollback Procedure

### If Production Deployment Fails

1. In Coolify, go to production application
2. Find previous successful deployment
3. Click "Redeploy" on that version

### If Bad Code Reaches Production

```bash
# Revert the merge commit on main
git checkout main
git pull
git revert -m 1 HEAD  # Reverts the merge
git push
# Coolify auto-deploys the revert
```

## Environment Variables Checklist

### Both Environments Need

- `DATABASE_URL` (different per environment!)
- `REDIS_HOST`, `REDIS_PORT`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (can be same or different)
- `AWS_*` or storage config
- `GOOGLE_AI_API_KEY` (if using AI features)

### Production Only

- `OPEN_FOR_BUSINESS=true` (when launched)
- `SENTRY_DSN` (production error tracking)
- Real Stripe keys

### Staging Only

- `OPEN_FOR_BUSINESS=true` (always, for testing)
- Stripe test keys
- Can use same or separate Sentry project

## Frontend Considerations

The frontend also needs staging/production setup:

| Setting        | Staging                               | Production                    |
| -------------- | ------------------------------------- | ----------------------------- |
| Branch         | `staging`                             | `main`                        |
| Domain         | `staging.cogveri.com`                 | `cogveri.com`                 |
| `VITE_API_URL` | `https://staging-api.cogveri.com/api` | `https://api.cogveri.com/api` |

## Future Improvements

- [ ] Add GitHub Actions for automated testing before merge
- [ ] Add database migration checks in CI
- [ ] Add Slack/Discord notifications for deployments
- [ ] Add automatic rollback on health check failure
