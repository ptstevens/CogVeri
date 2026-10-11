# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CogVeri is a multi-tenant SaaS platform for screen recording, task assignment, and AI-powered video analysis. Organizations can assign recording tasks, external contributors submit via magic links (no account required), and reviewers provide feedback with AI assistance.

## Architecture

**Monorepo Structure:**

- `frontend/` - React 18 SPA with Vite, TailwindCSS, React Query
- `backend/` - Express.js API server with PostgreSQL, Redis, BullMQ
- `transcription/` - Python worker using OpenAI Whisper for speech-to-text
- `tests/e2e/` - Playwright end-to-end tests

**Key Backend Patterns:**

- Routes in `backend/src/routes/` follow REST conventions, mounted in `routes/index.ts`
- Services in `backend/src/services/` contain business logic
- BullMQ queues in `backend/src/queues/` for async jobs (email, transcription, transcode, thumbnail, analysis)
- Middleware in `backend/src/middleware/` handles auth, rate limiting, metrics
- Database migrations via Knex in `backend/src/migrations/`

**Key Frontend Patterns:**

- Pages lazy-loaded in `frontend/src/App.tsx` for code splitting
- API client with token refresh in `frontend/src/services/api.ts`
- React Query for server state management
- Context providers: AuthContext, OrganizationContext, SocketContext

**AI Analysis Pipeline** (`backend/src/services/analysis/`):

- Frame extraction from video
- Speech analysis via transcription
- Visual analysis via Google Gemini
- Rubric-based scoring with configurable passing thresholds

## Common Commands

```bash
# Development
npm run dev              # Start both frontend (5173) and backend (3000)
npm run dev:backend      # Backend only with nodemon
npm run dev:frontend     # Frontend only with Vite

# Testing
npm run test             # Run all tests (backend + frontend)
npm run test:backend     # Backend tests with Vitest
npm run test:frontend    # Frontend tests with Vitest
npm run test:e2e         # Playwright E2E tests (starts dev servers automatically)
npm run test:e2e:ui      # Playwright with interactive UI

# Single test file
cd frontend && npx vitest run src/components/MyComponent.test.tsx
cd backend && npx vitest run tests/services/myService.test.ts

# Linting & Type Checking
npm run lint             # ESLint for both workspaces
npm run type-check       # TypeScript type checking

# Database
cd backend
npm run db:migrate       # Run migrations
npm run db:rollback      # Rollback last migration
npm run db:seed          # Seed database
npm run db:reset:dev     # Full reset (dev, skips templates)
```

## Environment Setup

Copy `.env.production.example` to `.env` and configure:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST/PORT` - Redis for queues and caching
- `JWT_SECRET` and `JWT_REFRESH_SECRET` - Required, app won't start without them
- `AWS_*` or `AWS_ENDPOINT_URL` - S3/R2 storage configuration
- `GOOGLE_AI_API_KEY` - For Gemini-powered video analysis

## Key Technical Details

**Authentication:** JWT with refresh token rotation. Magic links for external contributors.

**Multi-tenancy:** Organization-scoped data with role-based access (owner, admin, reviewer, member).

**Storage:** S3-compatible (AWS S3 or Cloudflare R2) for video files.

**Background Jobs:** BullMQ queues process:

- `send-email` - Transactional emails
- `transcription` - Can use Node.js worker or external Python Whisper worker
- `transcode` - Video format conversion via ffmpeg
- `thumbnail` - Video thumbnail generation
- `analysis` - AI-powered video analysis

**WebSocket:** Socket.IO for real-time updates (recording progress, analysis status).

## Testing Conventions

- Backend tests in `backend/tests/` using Vitest
- Frontend tests co-located with components as `*.test.tsx`
- E2E tests in `tests/e2e/` using Playwright
- Test setup files: `backend/tests/setup.ts`, `frontend/src/test/setup.ts`

## Docker Development

```bash
docker-compose up        # Full stack with Postgres, Redis, MinIO, MailHog
docker-compose up -d postgres redis  # Just dependencies
```

Ports: Postgres (5434), Backend (3001), Frontend (5174), Redis (6381), MinIO (9000/9001), MailHog (8025)
