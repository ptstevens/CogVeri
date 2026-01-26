# CogVeri Deployment Guide

This document outlines the steps required before deploying CogVeri to production.

## Pre-Deployment Checklist

### 1. Code Quality Checks

```bash
# Run from project root

# Type checking (both frontend and backend)
npm run type-check

# Linting
npm run lint

# Fix any linting issues automatically (if safe)
npm run lint -- --fix
```

### 2. Run Test Suites

#### Unit Tests

```bash
# Backend unit tests
npm run test:backend

# Frontend unit tests
npm run test:frontend

# Run all unit tests
npm run test
```

#### End-to-End Tests (Critical)

These tests verify production-critical functionality. **All must pass before deployment.**

```bash
# Ensure database is seeded with test data
cd backend && npm run db:seed && cd ..

# Run full E2E test suite
npm run test:e2e

# Or run critical path tests only (faster, minimum required)
npx playwright test tests/e2e/health-check.spec.ts tests/e2e/auth-flow.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/tasks.spec.ts tests/e2e/api-security.spec.ts
```

**Critical E2E Test Categories:**

| Test File | What It Validates | Must Pass? |
|-----------|------------------|------------|
| `health-check.spec.ts` | Backend health, DB connectivity, frontend loads | ✅ Yes |
| `auth-flow.spec.ts` | Login, logout, token validation, org selection | ✅ Yes |
| `dashboard.spec.ts` | Dashboard loads, stats display, navigation | ✅ Yes |
| `tasks.spec.ts` | Task CRUD, filtering, creation flow | ✅ Yes |
| `api-security.spec.ts` | Auth enforcement, multi-tenancy isolation | ✅ Yes |
| `reviews.spec.ts` | Review workflow, video playback, feedback | ⚠️ Recommended |
| `organization.spec.ts` | Org settings, member management | ⚠️ Recommended |
| `magic-link.spec.ts` | External contributor flow | ⚠️ If feature used |

### 3. Database Migrations

```bash
# Check for pending migrations
cd backend
npm run db:migrate:status

# Run any pending migrations (staging first!)
npm run db:migrate

# Verify migration success
npm run db:migrate:status
```

### 4. Environment Configuration

Verify all required environment variables are set in production:

```bash
# Required for app to start
JWT_SECRET                    # Must be set
JWT_REFRESH_SECRET            # Must be set
DATABASE_URL                  # PostgreSQL connection

# Required for core features
REDIS_HOST                    # Redis for queues/caching
REDIS_PORT
AWS_ACCESS_KEY_ID             # S3/R2 storage
AWS_SECRET_ACCESS_KEY
AWS_ENDPOINT_URL              # For Cloudflare R2
S3_BUCKET

# Required for AI features
GOOGLE_AI_API_KEY             # Gemini API for analysis

# Email (if using)
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS

# Stripe (if billing enabled)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### 5. Build Verification

```bash
# Build frontend
npm run build:frontend

# Build backend (if using compiled output)
npm run build:backend

# Verify builds complete without errors
```

### 6. Manual Smoke Test (Staging)

Before production, manually verify on staging:

- [ ] Can login with test account
- [ ] Dashboard loads with correct data
- [ ] Can create a new task
- [ ] Can start a recording (if applicable)
- [ ] Can view a recording playback
- [ ] Can submit a review
- [ ] External magic link flow works (if used)
- [ ] Email notifications are sent (check MailHog/logs)

---

## Deployment Steps

### Option A: Standard Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm ci

# 3. Run migrations
cd backend && npm run db:migrate && cd ..

# 4. Build
npm run build

# 5. Restart services
pm2 restart all  # or your process manager
```

### Option B: Docker Deployment

```bash
# 1. Pull latest images
docker-compose pull

# 2. Run migrations
docker-compose run --rm backend npm run db:migrate

# 3. Restart with new images
docker-compose up -d
```

### Option C: CI/CD Pipeline

If using GitHub Actions or similar, ensure the workflow includes:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Install dependencies
    run: npm ci

  - name: Type check
    run: npm run type-check

  - name: Lint
    run: npm run lint

  - name: Unit tests
    run: npm run test

  - name: E2E tests
    run: |
      npx playwright install --with-deps chromium
      npm run test:e2e

  - name: Build
    run: npm run build

  - name: Deploy
    run: # Your deployment command
```

---

## Post-Deployment Verification

### Immediate Checks (Within 5 minutes)

```bash
# 1. Health check
curl https://your-domain.com/health
# Expected: {"status":"ok","database":"ok",...}

# 2. API availability
curl https://your-domain.com/api/
# Expected: 200 response

# 3. Frontend loads
# Open https://your-domain.com in browser
# Verify login page appears without errors
```

### Functional Checks (Within 15 minutes)

- [ ] Login works with a real account
- [ ] Dashboard data loads correctly
- [ ] No console errors in browser
- [ ] Background jobs are processing (check BullMQ dashboard if available)
- [ ] Emails are being sent (check email provider logs)

### Monitoring Checks

- [ ] Error rate is normal (check Sentry/error tracking)
- [ ] Response times are acceptable (check APM)
- [ ] No memory leaks (check process metrics)
- [ ] Database connections are healthy

---

## Rollback Procedure

If issues are detected after deployment:

### Quick Rollback

```bash
# Revert to previous deployment
git checkout <previous-commit-sha>
npm ci
npm run build
pm2 restart all
```

### Database Rollback (if migration caused issues)

```bash
# Rollback last migration
cd backend
npm run db:rollback

# Rollback multiple migrations
npm run db:rollback -- --step 2
```

### Docker Rollback

```bash
# Revert to previous image tag
docker-compose down
docker-compose -f docker-compose.yml up -d --force-recreate
```

---

## Release Notes Template

When deploying, document what's included:

```markdown
## Release v1.x.x - YYYY-MM-DD

### Changes
- [Feature] Description of new feature
- [Fix] Description of bug fix
- [Chore] Infrastructure/dependency updates

### Database Migrations
- Migration 001: Description of schema change

### Breaking Changes
- None / List any breaking changes

### Configuration Changes
- New env var: `VAR_NAME` - Description

### Testing
- All E2E tests passing
- Unit test coverage: XX%

### Deployment Notes
- Special steps required: None / List any
```

---

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-call Engineer | [Name] | Slack #oncall |
| Database Admin | [Name] | [Email] |
| Infrastructure | [Name] | [Email] |

---

## Appendix: Test Commands Reference

```bash
# Full test suite
npm run test:e2e

# Specific test file
npx playwright test tests/e2e/auth-flow.spec.ts

# Tests matching pattern
npx playwright test -g "should login"

# Headed mode (see browser)
npx playwright test --headed

# Debug mode (step through)
npx playwright test --debug

# Generate HTML report
npx playwright show-report

# Run with specific workers
npx playwright test --workers=4
```

---

## Appendix: Common Issues

### E2E Tests Failing

**"Connection refused"**
- Ensure backend is running on port 3000
- Ensure frontend is running on port 5173
- Check `docker-compose up -d` if using Docker

**"Element not found"**
- UI may have changed - update page objects
- Check for loading states - add waits

**"Token validation failed"**
- Database may need reseeding: `npm run db:seed`
- Check JWT secrets match

### Database Issues

**"Migration failed"**
- Check for conflicting migrations
- Verify database connectivity
- Check for locked tables

**"Connection pool exhausted"**
- Increase pool size in DATABASE_URL
- Check for connection leaks
