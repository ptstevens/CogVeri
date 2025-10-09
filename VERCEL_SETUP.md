# Vercel Frontend Deployment Setup Guide

## 1. Deploy to Vercel

### Option A: Via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Select the `frontend` directory as the root
5. Vercel will auto-detect Vite framework

### Option B: Via Vercel CLI
```bash
cd frontend
npm install -g vercel
vercel
```

## 2. Configure Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables

Add these variables for **Production, Preview, and Development**:

### Required Variables

```bash
# Backend API URL - UPDATE WITH YOUR RAILWAY BACKEND URL
VITE_API_URL=https://your-backend-app.up.railway.app/api
VITE_SOCKET_URL=https://your-backend-app.up.railway.app

# App Configuration
VITE_APP_NAME=Relay
VITE_APP_ENVIRONMENT=production
```

### Recommended Variables

```bash
# WebSocket Configuration
VITE_SOCKET_PATH=/socket.io

# Authentication Storage Keys
VITE_AUTH_TOKEN_KEY=relay_auth_token
VITE_AUTH_REFRESH_TOKEN_KEY=relay_refresh_token
VITE_AUTH_USER_KEY=relay_user

# Feature Flags
VITE_FEATURE_LIVE_SESSIONS=true
VITE_FEATURE_SLACK_INTEGRATION=false
VITE_FEATURE_DARK_MODE=true

# Video Recording
VITE_MAX_RECORDING_SIZE_MB=500
VITE_MAX_RECORDING_DURATION_MINUTES=60
VITE_RECORDING_COUNTDOWN_SECONDS=3

# Performance
VITE_API_TIMEOUT=30000
VITE_CHUNK_SIZE=5242880
```

## 3. Update Railway Backend CORS

**IMPORTANT**: After deploying to Vercel, you need to update your Railway backend's CORS configuration!

1. Get your Vercel deployment URL (e.g., `https://relay-app.vercel.app`)
2. Go to Railway → Your Backend Service → Variables
3. Update `CORS_ORIGIN`:
   ```bash
   CORS_ORIGIN=https://relay-app.vercel.app,https://relay-app-preview.vercel.app
   ```

   > 💡 **Tip**: Add multiple origins separated by commas to support preview deployments

4. Railway will automatically redeploy with new CORS settings

## 4. Verify Deployment

### Check Build Logs
In Vercel Dashboard → Deployments → [Your Deployment] → Logs

Look for:
```
✓ built in XXXms
✓ Deployment ready
```

### Test the Frontend
1. Open your Vercel URL: `https://your-app.vercel.app`
2. Check browser console for errors
3. Try to register/login

## 5. Common Issues & Fixes

### Issue: "Network Error" or API calls failing

**Cause**: VITE_API_URL not set or incorrect

**Fix**:
```bash
# In Vercel environment variables, set:
VITE_API_URL=https://your-backend.railway.app/api
```

Then redeploy:
```bash
vercel --prod
```

---

### Issue: CORS errors in browser console

**Error**: `Access to fetch at 'https://backend...' from origin 'https://frontend...' has been blocked by CORS policy`

**Fix**:
1. Update Railway backend CORS_ORIGIN to include your Vercel URL
2. Make sure it matches EXACTLY (including https://, no trailing slash)

---

### Issue: WebSocket connection failed

**Cause**: VITE_SOCKET_URL points to localhost

**Fix**:
```bash
# In Vercel environment variables:
VITE_SOCKET_URL=https://your-backend.railway.app
VITE_SOCKET_PATH=/socket.io
```

---

### Issue: "Failed to fetch" on login/register

**Cause**: Backend might be down or environment variables not set

**Fix**:
1. Check Railway backend is running: `https://your-backend.railway.app/health`
2. Verify backend has JWT_SECRET set
3. Check browser Network tab for actual error response

---

## 6. Environment-Specific Configuration

Vercel supports different env vars for different environments:

### Production
```bash
VITE_APP_ENVIRONMENT=production
VITE_DEBUG_MODE=false
VITE_LOG_LEVEL=error
```

### Preview (Pull Request Deployments)
```bash
VITE_APP_ENVIRONMENT=staging
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=warn
```

### Development
```bash
VITE_APP_ENVIRONMENT=development
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=debug
```

## 7. Testing the Full Stack

Once both frontend (Vercel) and backend (Railway) are deployed:

### 1. Health Check
```bash
curl https://your-backend.railway.app/health
```

### 2. Test from Frontend
1. Open `https://your-app.vercel.app`
2. Open browser DevTools → Console
3. Try to register a user
4. Check Network tab for API calls
5. Verify no CORS errors

### 3. Test WebSocket
1. Login to the app
2. Open another browser/incognito tab
3. Login with different user
4. Check real-time notifications work

## 8. Deployment Checklist

- [ ] Frontend deployed to Vercel
- [ ] `VITE_API_URL` points to Railway backend
- [ ] `VITE_SOCKET_URL` points to Railway backend
- [ ] Railway `CORS_ORIGIN` includes Vercel URL
- [ ] Railway has `JWT_SECRET` configured
- [ ] Railway PostgreSQL database is connected
- [ ] Health endpoint responds: `/health`
- [ ] Registration works (test in browser)
- [ ] Login works
- [ ] WebSocket connections work
- [ ] No CORS errors in browser console

## 9. Quick Reference

### Frontend URLs
- **Production**: `https://your-app.vercel.app`
- **Preview**: `https://your-app-git-[branch].vercel.app`

### Backend URLs
- **Railway**: `https://your-backend.up.railway.app`
- **Health**: `https://your-backend.up.railway.app/health`
- **API**: `https://your-backend.up.railway.app/api/*`

### Environment Variables Summary

**Vercel (Frontend)**:
- `VITE_API_URL` → Railway backend URL + `/api`
- `VITE_SOCKET_URL` → Railway backend URL (no `/api`)

**Railway (Backend)**:
- `CORS_ORIGIN` → Vercel frontend URL
- `JWT_SECRET` → Random secure string
- `DATABASE_URL` → Auto-set by Railway PostgreSQL

---

## 10. Redeploying

### Redeploy Frontend (Vercel)
```bash
git push origin main  # Auto-deploys
# OR
vercel --prod
```

### Redeploy Backend (Railway)
```bash
git push origin main  # Auto-deploys
# OR via Railway CLI
railway up
```

---

## Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **Check Logs**: Both platforms have excellent log viewers in their dashboards
