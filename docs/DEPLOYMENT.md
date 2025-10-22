# Revui Production Deployment Guide

This guide covers deploying Revui with:
- **Frontend**: Vercel (revui.app)
- **Backend**: Ubuntu server with Coolify (api.revui.app)
- **Storage**: Cloudflare R2
- **Access**: Cloudflare Tunnel

## Architecture Overview

```
┌─────────────────┐
│   revui.app     │
│  (Vercel CDN)   │
└────────┬────────┘
         │
         │ HTTPS
         │
         ▼
┌─────────────────────────────────┐
│   api.revui.app                 │
│   (Cloudflare Tunnel)           │
└────────┬────────────────────────┘
         │
         │ Tunnel
         │
         ▼
┌─────────────────────────────────┐
│   Ubuntu Server (Dell Laptop)   │
│                                  │
│   ┌─────────────────────────┐  │
│   │  Coolify                │  │
│   │  ┌──────────────────┐   │  │
│   │  │ Revui Backend    │   │  │
│   │  │ (Docker)         │   │  │
│   │  └──────────────────┘   │  │
│   │  ┌──────────────────┐   │  │
│   │  │ PostgreSQL       │   │  │
│   │  └──────────────────┘   │  │
│   └─────────────────────────┘  │
└─────────────────────────────────┘
         │
         │ S3 API
         │
         ▼
┌─────────────────────────────────┐
│   Cloudflare R2                 │
│   (revui-recordings)            │
└─────────────────────────────────┘
```

## Prerequisites

- ✅ Ubuntu server with Coolify installed
- ✅ Cloudflare account with R2 enabled
- ✅ Domain revui.app configured in Cloudflare
- ✅ Vercel account
- ✅ Node.js 18+ and npm installed
- ✅ Git repository access

---

## Phase 1: Cloudflare R2 Storage Setup

### 1.1 Create R2 Bucket

1. Log into Cloudflare Dashboard
2. Navigate to **R2 Object Storage**
3. Click **Create Bucket**
4. Bucket name: `revui-recordings`
5. Location: Auto (or choose closest region)
6. Click **Create Bucket**

### 1.2 Generate R2 API Tokens

1. Go to **R2** → **Manage R2 API Tokens**
2. Click **Create API Token**
3. Token name: `revui-production`
4. Permissions: **Object Read & Write**
5. TTL: Never expire (or set appropriate expiry)
6. Click **Create API Token**
7. **SAVE THESE VALUES** (you won't see them again):
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (format: `https://<account-id>.r2.cloudflarestorage.com`)

### 1.3 Configure Bucket CORS

In the R2 bucket settings, add CORS policy:

```json
[
  {
    "AllowedOrigins": [
      "https://revui.app",
      "https://api.revui.app"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Phase 2: Cloudflare Tunnel Setup

### 2.1 Install cloudflared on Ubuntu Server

```bash
# Download and install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Verify installation
cloudflared --version
```

### 2.2 Authenticate cloudflared

```bash
cloudflared tunnel login
```

This will open a browser to authenticate with Cloudflare.

### 2.3 Create Tunnel

```bash
# Create tunnel named 'revui-backend'
cloudflared tunnel create revui-backend

# Note the Tunnel ID from the output
# Example: Created tunnel revui-backend with id a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### 2.4 Create Tunnel Configuration

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: revui-backend
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: api.revui.app
    service: http://localhost:3000
  - service: http_status:404
```

Replace `<TUNNEL-ID>` with your actual tunnel ID.

### 2.5 Configure DNS

```bash
# Point api.revui.app to the tunnel
cloudflared tunnel route dns revui-backend api.revui.app
```

### 2.6 Run Tunnel as Service

```bash
# Install as system service
sudo cloudflared service install

# Start the service
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

---

## Phase 3: Backend Environment Configuration

### 3.1 Create Production Environment File

Create `.env.production` in your backend directory:

```env
# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://revui.app

# Database
DATABASE_URL=postgresql://revui_user:YOUR_SECURE_PASSWORD@localhost:5432/revui_production

# JWT
JWT_SECRET=YOUR_SUPER_SECURE_JWT_SECRET_CHANGE_THIS
JWT_EXPIRES_IN=7d

# Cloudflare R2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=revui-recordings
R2_PUBLIC_URL=https://your-r2-bucket-public-url

# Email (Optional - for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
FROM_EMAIL=noreply@revui.app

# Security
ALLOWED_ORIGINS=https://revui.app
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### 3.2 Generate Secure Secrets

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate database password
openssl rand -base64 32
```

---

## Phase 4: PostgreSQL Database Setup

### 4.1 Install PostgreSQL (if not already installed)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 4.2 Create Database and User

```bash
# Connect as postgres user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE revui_production;
CREATE USER revui_user WITH ENCRYPTED PASSWORD 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE revui_production TO revui_user;
ALTER DATABASE revui_production OWNER TO revui_user;

# Grant schema permissions
\c revui_production
GRANT ALL ON SCHEMA public TO revui_user;

# Exit
\q
```

### 4.3 Configure PostgreSQL for Local Access

Edit `/etc/postgresql/*/main/pg_hba.conf`:

```
# Add this line (or ensure it exists):
local   all             revui_user                              scram-sha-256
host    all             revui_user      127.0.0.1/32            scram-sha-256
```

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

### 4.4 Test Connection

```bash
psql -U revui_user -d revui_production -h localhost
```

---

## Phase 5: Deploy Backend to Coolify

### 5.1 Prepare Backend for Docker

Ensure your backend has a proper `Dockerfile`:

```dockerfile
# Multi-stage build for smaller image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/index.js"]
```

Add `.dockerignore`:

```
node_modules
.env
.env.*
dist
*.log
.git
.github
README.md
```

### 5.2 Configure Coolify Deployment

1. Log into Coolify dashboard
2. Create new **Application**
3. Configure:
   - **Name**: `revui-backend`
   - **Source**: Connect your Git repository
   - **Branch**: `main` (or your production branch)
   - **Port**: `3000`
   - **Build Pack**: Docker

### 5.3 Add Environment Variables in Coolify

In Coolify's environment variables section, add all variables from your `.env.production`:

```
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://revui.app
DATABASE_URL=postgresql://revui_user:YOUR_PASSWORD@host.docker.internal:5432/revui_production
JWT_SECRET=your_jwt_secret
...
```

**Important**: Use `host.docker.internal` instead of `localhost` for database connection from Docker container.

### 5.4 Configure Health Check

In Coolify settings:
- **Health Check Path**: `/api/health`
- **Health Check Port**: `3000`

### 5.5 Deploy

1. Click **Deploy** in Coolify
2. Monitor logs for any errors
3. Verify deployment success

### 5.6 Run Database Migrations

After first deployment, run migrations:

```bash
# SSH into your server
ssh user@your-server

# Run migrations through Docker
docker exec -it <revui-backend-container-id> npm run migrate

# Or if you have npm scripts for migrations:
docker exec -it <revui-backend-container-id> npm run db:migrate
```

---

## Phase 6: Frontend Configuration

### 6.1 Update Frontend Environment

Create `.env.production` in frontend directory:

```env
VITE_API_URL=https://api.revui.app/api
VITE_APP_NAME=Revui
VITE_ENVIRONMENT=production
```

### 6.2 Update CORS Domains

In `frontend/src/config/api.ts` or equivalent, ensure the API URL is configurable:

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
```

### 6.3 Build Test Locally

```bash
cd frontend
npm run build

# Test the build
npm run preview
```

---

## Phase 7: Deploy Frontend to Vercel

### 7.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 7.2 Login to Vercel

```bash
vercel login
```

### 7.3 Link Project

```bash
cd frontend
vercel link
```

Choose:
- Create new project or link existing
- Project name: `revui`

### 7.4 Configure Build Settings

Create `vercel.json` in frontend directory:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### 7.5 Add Environment Variables in Vercel

```bash
# Add environment variables
vercel env add VITE_API_URL production
# Enter: https://api.revui.app/api

vercel env add VITE_APP_NAME production
# Enter: Revui

vercel env add VITE_ENVIRONMENT production
# Enter: production
```

Or add them via Vercel Dashboard:
1. Go to project settings
2. Navigate to **Environment Variables**
3. Add each variable

### 7.6 Deploy to Production

```bash
vercel --prod
```

### 7.7 Configure Custom Domain

1. Go to Vercel Dashboard → Your Project
2. Navigate to **Settings** → **Domains**
3. Add domain: `revui.app`
4. Follow DNS configuration instructions
5. Add DNS records in Cloudflare:
   - Type: `CNAME`
   - Name: `@` (or subdomain)
   - Target: `cname.vercel-dns.com`
   - Proxy status: DNS only (grey cloud)

Wait for DNS propagation (can take up to 48 hours, usually much faster).

---

## Phase 8: Security & CORS Configuration

### 8.1 Update Backend CORS

In `backend/src/middleware/cors.ts` or equivalent:

```typescript
import cors from 'cors';

const allowedOrigins = [
  'https://revui.app',
  'https://www.revui.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### 8.2 Configure Rate Limiting

In `backend/src/middleware/rateLimiter.ts`:

```typescript
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Limit auth attempts
  message: 'Too many authentication attempts, please try again later.',
});
```

### 8.3 Configure Security Headers

Install helmet:

```bash
npm install helmet
```

In `backend/src/index.ts`:

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.revui.app"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
```

---

## Phase 9: Testing & Verification

### 9.1 Backend Health Check

```bash
# Test backend through tunnel
curl https://api.revui.app/api/health

# Expected response:
# {"status":"ok","timestamp":"..."}
```

### 9.2 Test R2 Upload

Create a test script `test-r2.js`:

```javascript
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function testUpload() {
  const command = new PutObjectCommand({
    Bucket: 'revui-recordings',
    Key: 'test.txt',
    Body: 'Hello from Revui!',
  });

  try {
    const response = await s3Client.send(command);
    console.log('✅ Upload successful:', response);
  } catch (error) {
    console.error('❌ Upload failed:', error);
  }
}

testUpload();
```

Run test:

```bash
node test-r2.js
```

### 9.3 Test Frontend → Backend Connection

1. Visit `https://revui.app`
2. Open browser DevTools → Network tab
3. Try to login or access API
4. Verify requests go to `https://api.revui.app/api`
5. Check for CORS errors (should be none)

### 9.4 Test Full Recording Flow

1. **Create Task**:
   - Login as manager
   - Create a new task
   - Assign to user

2. **Record Video**:
   - Login as assigned user
   - Navigate to task
   - Start recording
   - Stop and submit

3. **Verify Upload**:
   - Check Coolify logs for upload confirmation
   - Check R2 bucket for file

4. **Review Recording**:
   - Login as manager/reviewer
   - Navigate to Reviews
   - Find submitted task
   - Verify video plays
   - Approve or reject

### 9.5 Test Authentication Flow

```bash
# Test registration
curl -X POST https://api.revui.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "name": "Test User"
  }'

# Test login
curl -X POST https://api.revui.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

---

## Phase 10: Monitoring & Maintenance

### 10.1 Set Up Logging

**Backend Logging** (using Winston):

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

export default logger;
```

### 10.2 Monitor Cloudflare Tunnel

```bash
# Check tunnel status
sudo systemctl status cloudflared

# View tunnel logs
sudo journalctl -u cloudflared -f

# Restart tunnel if needed
sudo systemctl restart cloudflared
```

### 10.3 Monitor Coolify Deployment

- Access Coolify dashboard
- Check application logs
- Monitor resource usage (CPU, memory)
- Set up alerts for downtime

### 10.4 Database Backups

Create backup script `/home/revui/backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/revui/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/revui_production_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U revui_user revui_production > $BACKUP_FILE

# Compress
gzip $BACKUP_FILE

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: ${BACKUP_FILE}.gz"
```

Make executable and schedule:

```bash
chmod +x /home/revui/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /home/revui/backup-db.sh
```

### 10.5 R2 Storage Monitoring

1. Go to Cloudflare Dashboard → R2
2. Monitor:
   - Storage usage
   - Request count
   - Bandwidth
3. Set up email alerts for:
   - Storage threshold (e.g., 80% full)
   - High request rates

### 10.6 Uptime Monitoring

Set up external monitoring (e.g., UptimeRobot, Pingdom):
- Monitor: `https://api.revui.app/api/health`
- Interval: 5 minutes
- Alert on: Downtime > 5 minutes

### 10.7 SSL Certificate Monitoring

Cloudflare Tunnel handles SSL automatically, but verify:
- `https://revui.app` - Check for valid SSL
- `https://api.revui.app` - Check for valid SSL

Both should show valid certificates from Cloudflare.

---

## Troubleshooting

### Issue: Backend Not Accessible

**Check Cloudflare Tunnel**:
```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 50
```

**Verify Backend is Running**:
```bash
curl http://localhost:3000/api/health
```

**Check Coolify Logs**:
- Access Coolify dashboard
- View application logs for errors

### Issue: CORS Errors

**Verify Frontend URL in Backend**:
```env
FRONTEND_URL=https://revui.app
ALLOWED_ORIGINS=https://revui.app
```

**Check Response Headers**:
```bash
curl -I -X OPTIONS https://api.revui.app/api/tasks \
  -H "Origin: https://revui.app" \
  -H "Access-Control-Request-Method: GET"
```

### Issue: R2 Upload Failures

**Test R2 Credentials**:
```bash
# Using AWS CLI (S3 compatible)
aws s3 ls s3://revui-recordings \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
  --profile r2
```

**Check Backend Logs**:
Look for R2-related errors in Coolify logs.

### Issue: Database Connection Failed

**Verify PostgreSQL is Running**:
```bash
sudo systemctl status postgresql
```

**Test Connection from Docker**:
```bash
docker exec -it <container-id> bash
psql -U revui_user -d revui_production -h host.docker.internal
```

### Issue: Frontend Build Failures on Vercel

**Check Build Logs**:
- Vercel Dashboard → Deployments → Latest deployment → Logs

**Common Fixes**:
- Verify `package.json` has correct build script
- Check environment variables are set
- Ensure all dependencies are in `package.json`

---

## Deployment Checklist

Use this checklist when deploying:

### Pre-Deployment

- [ ] Cloudflare R2 bucket created (`revui-recordings`)
- [ ] R2 API tokens generated and saved
- [ ] Cloudflare Tunnel installed on Ubuntu server
- [ ] Tunnel created and DNS configured (`api.revui.app`)
- [ ] PostgreSQL installed and running
- [ ] Database and user created (`revui_production`, `revui_user`)
- [ ] Backend `.env.production` configured with all secrets
- [ ] Frontend `.env.production` configured
- [ ] Coolify project created

### Backend Deployment

- [ ] Backend repository connected to Coolify
- [ ] Environment variables added to Coolify
- [ ] Dockerfile optimized for production
- [ ] Health check endpoint configured
- [ ] Backend deployed successfully
- [ ] Database migrations run
- [ ] Backend health check passes (`/api/health`)

### Frontend Deployment

- [ ] Vercel project created and linked
- [ ] Environment variables added to Vercel
- [ ] `vercel.json` configured
- [ ] Custom domain added (`revui.app`)
- [ ] DNS records configured in Cloudflare
- [ ] Frontend deployed successfully
- [ ] SSL certificate valid

### Security & Testing

- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Security headers configured (Helmet)
- [ ] Frontend can reach backend API
- [ ] Authentication flow works end-to-end
- [ ] Recording upload works
- [ ] Video playback works
- [ ] Review system functional

### Monitoring & Maintenance

- [ ] Logging configured
- [ ] Database backup script created and scheduled
- [ ] Uptime monitoring set up
- [ ] Cloudflare Tunnel service running and enabled
- [ ] Alert notifications configured
- [ ] Documentation updated

---

## Useful Commands Reference

### Cloudflare Tunnel

```bash
# Status
sudo systemctl status cloudflared

# Restart
sudo systemctl restart cloudflared

# View logs
sudo journalctl -u cloudflared -f

# List tunnels
cloudflared tunnel list

# Delete tunnel (if needed)
cloudflared tunnel delete revui-backend
```

### PostgreSQL

```bash
# Connect to database
psql -U revui_user -d revui_production -h localhost

# List databases
\l

# Connect to database
\c revui_production

# List tables
\dt

# Show table structure
\d tasks

# Exit
\q
```

### Docker (Coolify)

```bash
# List containers
docker ps

# View logs
docker logs -f <container-id>

# Execute command in container
docker exec -it <container-id> bash

# Restart container
docker restart <container-id>
```

### Vercel

```bash
# Deploy to production
vercel --prod

# View logs
vercel logs revui-app --follow

# List deployments
vercel ls

# Promote deployment
vercel promote <deployment-url>
```

---

## Support & Resources

- **Coolify Documentation**: https://coolify.io/docs
- **Cloudflare Tunnel**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **Vercel Documentation**: https://vercel.com/docs
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/

---

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use strong passwords** for database and JWT secrets (32+ characters)
3. **Regularly update dependencies**: `npm audit fix`
4. **Monitor logs** for suspicious activity
5. **Backup database regularly** (automated daily backups)
6. **Keep server updated**: `sudo apt update && sudo apt upgrade`
7. **Use environment variables** for all configuration
8. **Enable firewall** on Ubuntu server: `sudo ufw enable`
9. **Restrict database access** to localhost only
10. **Rotate API keys** periodically (every 90 days)

---

## Performance Optimization

1. **Enable Cloudflare CDN** for static assets
2. **Use Vercel Edge Network** for frontend
3. **Optimize video encoding** before upload
4. **Implement pagination** for large datasets
5. **Add database indexes** for frequently queried fields
6. **Enable compression** in backend (gzip/brotli)
7. **Cache API responses** where appropriate
8. **Monitor R2 bandwidth** and optimize large files

---

## Maintenance Schedule

### Daily
- Check Cloudflare Tunnel status
- Review application logs for errors
- Monitor uptime alerts

### Weekly
- Review database size and growth
- Check R2 storage usage
- Review security logs
- Update dependencies (minor versions)

### Monthly
- Review and rotate logs
- Update system packages: `sudo apt update && sudo apt upgrade`
- Review access logs for suspicious activity
- Test disaster recovery procedures

### Quarterly
- Rotate API keys and secrets
- Review and update security policies
- Performance audit and optimization
- Update dependencies (major versions)

---

*Last Updated: 2025-10-22*
*Revui Production Deployment Guide v1.0*
