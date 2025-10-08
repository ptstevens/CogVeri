# Revui Deployment Guide

Complete step-by-step guide to deploy Revui to production using Vercel + Railway + Cloudflare R2.

## Prerequisites

- ✅ Domain: revui.app (purchased)
- ✅ Vercel account
- 🔲 GitHub account
- 🔲 Railway account
- 🔲 Cloudflare account

---

## Part 1: Push Code to GitHub

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `revui` or `revui-app`
3. Keep it **Private** (recommended for now)
4. **Do NOT** initialize with README (we already have files)
5. Click "Create repository"

### Step 2: Push Code

Open Terminal and run these commands from your project directory:

```bash
cd "/Users/paulstevens/Documents/Projects/AI Code/Relay"

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Revui video review platform"

# Add GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/revui.git

# Push to GitHub
git push -u origin master
```

---

## Part 2: Set Up Cloudflare R2 (Video Storage)

### Step 1: Create Cloudflare Account

1. Go to https://cloudflare.com
2. Sign up for free account
3. Verify your email

### Step 2: Create R2 Bucket

1. In Cloudflare dashboard, go to **R2** from sidebar
2. Click "Create bucket"
3. Bucket name: `revui-recordings`
4. Location: Automatic
5. Click "Create bucket"

### Step 3: Get R2 API Credentials

1. In R2 dashboard, click "Manage R2 API Tokens"
2. Click "Create API token"
3. Token name: `revui-backend`
4. Permissions: "Object Read & Write"
5. Click "Create API Token"
6. **IMPORTANT**: Copy these values NOW (you won't see them again):
   - Access Key ID
   - Secret Access Key
   - Account ID (from R2 main page)

### Step 4: Get R2 Endpoint URL

Your endpoint will be: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

Replace `<ACCOUNT_ID>` with your actual Account ID from step 3.

---

## Part 3: Deploy Backend to Railway

### Step 1: Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub (easiest)
3. Verify your account

### Step 2: Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account if needed
4. Select your `revui` repository
5. Railway will detect it's a monorepo

### Step 3: Configure Backend Service

1. Railway should detect the backend folder
2. If not, click "Settings" → "Root Directory" → Set to `backend`
3. Under "Build" settings:
   - Build Command: `npm run build`
   - Start Command: `npm start`
4. Click "Deploy"

### Step 4: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will create and link it automatically

### Step 5: Set Environment Variables

In Railway dashboard, go to your backend service → "Variables" tab.

Add these variables (click "Raw Editor" for easier pasting):

```
NODE_ENV=production
PORT=3000

# Database (Railway provides these automatically, but verify they're set)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# JWT Secrets (generate random strings)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-different-from-above

# Cloudflare R2 (from Part 2, Step 3)
AWS_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
AWS_BUCKET_NAME=revui-recordings
AWS_REGION=auto
AWS_ACCESS_KEY_ID=your-r2-access-key-id
AWS_SECRET_ACCESS_KEY=your-r2-secret-access-key

# Email (optional - for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@revui.app

# CORS (will update after Vercel deployment)
CORS_ORIGIN=https://revui.app,https://www.revui.app

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Important**:
- Generate strong random strings for JWT secrets (use password generator)
- Copy your R2 credentials from Part 2
- Backend URL will be like: `https://your-project.up.railway.app`

### Step 6: Get Backend URL

1. After deployment, Railway assigns a URL
2. Go to "Settings" → "Networking"
3. Copy the "Public URL" (e.g., `https://revui-backend-production.up.railway.app`)
4. **Save this URL** - you'll need it for frontend!

---

## Part 4: Deploy Frontend to Vercel

### Step 1: Connect Vercel to GitHub

1. Log in to https://vercel.com
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Select the `revui` repo

### Step 2: Configure Frontend Build

Vercel should auto-detect Vite. Configure these settings:

- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Set Environment Variables

Click "Environment Variables" and add:

```
# Backend API URL (from Railway - Part 3, Step 6)
VITE_API_URL=https://your-railway-backend-url.up.railway.app/api

# WebSocket URL (same as API but with wss://)
VITE_SOCKET_URL=https://your-railway-backend-url.up.railway.app

# App Configuration
VITE_APP_NAME=Revui
VITE_APP_VERSION=1.0.0
VITE_APP_ENVIRONMENT=production

# Copy other settings from .env.example as needed
```

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Vercel will give you a URL like `https://revui-xyz.vercel.app`

---

## Part 5: Connect Custom Domain (revui.app)

### Step 1: Add Domain to Vercel

1. In Vercel project settings, go to "Domains"
2. Click "Add"
3. Enter: `revui.app`
4. Also add: `www.revui.app`
5. Vercel will show DNS records to configure

### Step 2: Configure DNS

You'll need to update DNS where you bought your domain:

**For root domain (revui.app):**
- Type: `A`
- Name: `@`
- Value: `76.76.21.21` (Vercel's IP)

**For www subdomain:**
- Type: `CNAME`
- Name: `www`
- Value: `cname.vercel-dns.com`

**SSL Certificate:**
- Vercel handles this automatically
- Wait 5-10 minutes for DNS propagation
- Vercel will issue free SSL certificate

---

## Part 6: Final Configuration

### Update Backend CORS

1. Go back to Railway
2. Update `CORS_ORIGIN` variable:
   ```
   CORS_ORIGIN=https://revui.app,https://www.revui.app
   ```
3. Redeploy if needed

### Run Database Migrations

Railway should run migrations automatically on deploy. To verify:

1. In Railway, go to your backend service
2. Click "Deployments" → Latest deployment
3. Check logs for migration messages

If migrations didn't run, you can trigger them:
1. Railway → Backend service → "Settings" → "Deploy Triggers"
2. Add script: `npm run migrate:latest`

---

## Part 7: Test Your Deployment

### Checklist:

- [ ] Visit https://revui.app - frontend loads
- [ ] Try logging in
- [ ] Create a test task
- [ ] Start a test recording
- [ ] Upload completes to R2
- [ ] WebSocket connection works (real-time updates)
- [ ] Check browser console for errors

### Common Issues:

**Frontend can't connect to backend:**
- Check `VITE_API_URL` in Vercel
- Verify Railway backend is running
- Check CORS settings in Railway

**Video upload fails:**
- Verify R2 credentials in Railway
- Check R2 bucket exists
- Look at Railway logs for errors

**Database errors:**
- Ensure migrations ran
- Check `DATABASE_URL` is set in Railway
- Review Railway PostgreSQL logs

---

## Monitoring & Costs

### Free Tier Limits:

**Vercel:**
- 100GB bandwidth/month
- Unlimited deployments
- Free SSL

**Railway:**
- $5 free credit/month
- ~500 hours runtime
- Then ~$10-15/month

**Cloudflare R2:**
- 10GB storage free
- Unlimited egress (downloads)
- Very cheap beyond: $0.015/GB/month

### Cost Estimation (100 users):

- Vercel: **$0** (within free tier)
- Railway: **$10-15/month** (backend + database)
- R2: **~$1.50/month** for 100GB video storage
- **Total: ~$12-17/month**

---

## Getting Help

If something goes wrong:

1. **Check Railway Logs**: Railway dashboard → Service → "Logs"
2. **Check Vercel Logs**: Vercel dashboard → Project → "Deployments" → Click deployment
3. **Check Browser Console**: F12 → Console tab
4. **Database Issues**: Railway → PostgreSQL → "Logs"

---

## Next Steps After Deployment

1. Set up custom email domain for notifications
2. Configure monitoring (optional - Sentry, LogRocket)
3. Set up automated backups for PostgreSQL
4. Add analytics if desired
5. Set up staging environment (duplicate setup)

---

## Quick Reference: URLs & Credentials

Fill these in as you complete setup:

```
GitHub Repo: https://github.com/____________________/revui
Railway Backend: https://________________________________.up.railway.app
Vercel Frontend: https://revui.app
R2 Bucket: revui-recordings
R2 Endpoint: https://________.r2.cloudflarestorage.com
```

**Store credentials securely** (use password manager):
- JWT_SECRET
- JWT_REFRESH_SECRET
- R2 Access Keys
- Database password (Railway provides this)
- Email SMTP password

---

## Congratulations!

Once complete, your Revui app will be live at **https://revui.app** with:
- ✅ Professional domain
- ✅ Free SSL certificate
- ✅ Scalable video storage
- ✅ Real-time WebSocket support
- ✅ Automatic deployments from Git
- ✅ Production-ready backend with database

Any changes you push to GitHub master branch will automatically deploy!
