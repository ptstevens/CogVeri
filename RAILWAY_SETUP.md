# Railway Deployment Setup Guide

## 1. Add PostgreSQL Database

In your Railway project:
1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically set `DATABASE_URL` environment variable

## 2. Configure Environment Variables

Go to your backend service → "Variables" and add:

### Required Variables

```bash
# Node Environment
NODE_ENV=production

# JWT Secrets (COPY THESE - GENERATED SECURELY)
JWT_SECRET=2qT89TeaA3HdahgbHRqiiHGFVk59TJG41JigG4jUti0sKtA56px92vYJSjt6JGdQ/ZP5uo6uP93pZYd4SAlJUQ==
JWT_REFRESH_SECRET=p19laKp5ZyV6KG63aFs+swoyLcOA2AA3lzxnbNFK7OwFAPsznX4Lc3Mio6hGL5sBCREpmhTLDJsv9n8yvLaJ9w==

# CORS - UPDATE WITH YOUR FRONTEND URL
CORS_ORIGIN=https://your-frontend-app.up.railway.app

# Optional but Recommended
LOG_LEVEL=info
LOG_FORMAT=json
```

### Optional Variables (Features)

```bash
# Enable Debug Endpoints (for troubleshooting production issues)
ENABLE_DEBUG=true

# Email Notifications (Gmail)
EMAIL_ENABLED=true
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
EMAIL_FROM=Relay System <noreply@relay.company.com>

# AWS S3 for Video Storage (recommended for production)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=relay-recordings

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 3. Check Deployment Logs

After adding the environment variables:
1. Railway will automatically redeploy
2. Watch the deployment logs for errors
3. Check for successful database migration messages

## 4. Test the Deployment

### Health Check
```bash
curl https://your-backend-app.up.railway.app/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2024-...",
  "uptime": 123.456,
  "environment": "production"
}
```

### Debug Endpoints (if ENABLE_DEBUG=true)

**Check Configuration:**
```bash
curl https://your-backend-app.up.railway.app/api/debug/config
```

**Test Database Connection:**
```bash
curl https://your-backend-app.up.railway.app/api/debug/db
```

**List Database Tables:**
```bash
curl https://your-backend-app.up.railway.app/api/debug/tables
```

### Test Registration
```bash
curl -X POST https://your-backend-app.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "name": "Test User"
  }'
```

## 5. Common Issues

### 500 Error on /api/auth/register

**Cause**: Missing JWT_SECRET environment variable

**Fix**: Add JWT_SECRET and JWT_REFRESH_SECRET to Railway variables

---

### Database Connection Failed

**Cause**: DATABASE_URL not set or PostgreSQL not added

**Fix**:
1. Add PostgreSQL database in Railway
2. Wait for DATABASE_URL to be automatically set
3. Redeploy the service

---

### CORS Errors from Frontend

**Cause**: CORS_ORIGIN not set to frontend URL

**Fix**:
1. Get your Railway frontend URL
2. Set CORS_ORIGIN=https://your-frontend-url.railway.app
3. Redeploy

---

### "relation 'users' does not exist" Error

**Cause**: Database migrations not running before server starts

**Symptoms**:
- 500 error on `/api/auth/register`
- Logs show: `relation "users" does not exist`
- Server starts successfully but database tables are missing

**Fix**:
1. Verify `railway.json` is in the **monorepo root** (not in `backend/` subdirectory)
2. Check Railway logs show migration output before server starts:
   ```
   Running migrations...
   Batch 1 run: X migrations
   ```
3. If migrations still don't run, manually trigger them:
   ```bash
   railway run --service backend npm run db:migrate:prod
   ```

**Debug**:
- Enable debug endpoints: Set `ENABLE_DEBUG=true` in Railway variables
- Check `/api/debug/tables` to see if tables exist
- Check `/api/debug/db` to verify database connection

---

## 6. Monitoring

### Check Logs
```bash
railway logs --service backend
```

### Check Database Migrations
Look for these log messages:
```
[info] Running migrations...
[info] Batch 1 run: X migrations
[info] Database migrations completed successfully
```

## 7. Next Steps

1. ✅ Verify health endpoint responds
2. ✅ Test user registration
3. ✅ Test user login
4. ✅ Deploy frontend with correct backend URL
5. ✅ Test full authentication flow

---

## Security Notes

⚠️ **NEVER commit `.env` files with real secrets to git!**
⚠️ **Regenerate JWT secrets periodically**
⚠️ **Use strong, unique passwords for all services**
⚠️ **Enable 2FA on your Railway account**
