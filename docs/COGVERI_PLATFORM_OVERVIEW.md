# CogVeri Platform Overview

> **What CogVeri Is:** A cognitive verification platform for recording, transcribing, AI-analysing, and reviewing task-based assessments. It uses AI (Google Gemini) to score recordings against rubrics and provides human review workflows on top.

> **Stage:** Pre-release. No paying customers yet.

---

## Core Product Loop

```
Create Task → Assign/Share via Magic Link → Contributor Records Screen
     ↓
Recording Uploaded (chunked, multipart to R2)
     ↓
Transcription (Whisper via Python worker)
     ↓
AI Analysis (Gemini — speech + visual evidence scored against rubric steps)
     ↓
Human Review → Feedback Loop → Re-record if needed
```

---

## 1. Task Management

| Capability | Detail |
|------------|--------|
| Create tasks | Title, description, evaluation criteria, due dates, checklists |
| Assign to internal users | Direct assignment within org |
| Share externally via magic link | Public task page, no account needed |
| Task templates | Reusable configs with pre-built rubrics and calibration data |
| System default templates | Auto-provisioned on org creation, restorable |
| Task statuses | `pending → in_progress → submitted → completed` |
| Attempt tracking | `attempt_number` per task for re-recording support |
| Bulk task creation | Via template instantiation |

**API:** 12 endpoints — CRUD, assign, submit, statistics, status filtering

---

## 2. Recording & Upload

| Capability | Detail |
|------------|--------|
| Screen recording | In-browser via Screen Capture API |
| Webcam overlay | Picture-in-picture webcam bubble during recording |
| Chunked upload | Multipart upload to Cloudflare R2 (S3-compatible) |
| Upload sessions | Resumable — tracks parts, supports abort/retry |
| Recording variants | Multiple quality variants per recording |
| Duration probing | Server-side `ffprobe` to extract actual duration |
| Playback | Pre-signed R2 URLs with expiry |
| File size tracking | `recording_file_sizes` table per variant |
| External contributor recording | Full recording flow via magic link (no account needed) |

**API:** 14 endpoints — CRUD, multipart lifecycle, playback URLs, processing status

---

## 3. Transcription

| Capability | Detail |
|------------|--------|
| Engine | OpenAI Whisper (Python worker, separate container) |
| Segmented output | Word-level timestamps stored in `transcription_segments` |
| Job tracking | `transcription_jobs` with status, progress, error handling |
| Queue | BullMQ `transcription` queue (async processing) |
| Language support | Whisper auto-detection |

**API:** 10 endpoints — trigger, status, segments, search within transcript

---

## 4. AI Analysis (The Core Differentiator)

| Capability | Detail |
|------------|--------|
| Engine | Google Gemini (configurable model + prompts) |
| Speech analysis | Transcript matched against rubric keywords/criteria |
| Visual analysis | Video frames extracted + analysed for UI elements, actions |
| Native video analysis | Direct video-to-Gemini for supported models |
| Similarity scoring | Compare recording against calibration reference videos |
| Step-by-step scoring | Each rubric step scored: `YES / PARTIAL / NO` with confidence |
| Weighted scoring | Per-step weights, required step enforcement |
| Equal scoring | Alternative: simple pass/fail ratio |
| Verdicts | `PASS / PARTIAL_PASS / NEEDS_REVIEW / FAIL` |
| Confidence scores | Per-step and overall confidence (0-1) |
| Evidence attribution | Speech excerpts + visual elements linked to each score |
| AI reasoning | Stored per step — explains why the score was given |
| Summary generation | Auto-generated strengths, improvements, overall text |
| PDF export | Full analysis report downloadable as PDF |
| Observability | Per-analysis debug logs, variance alerts, performance metrics |
| Configurable prompts | System admin can edit/test/revert AI prompts (versioned) |

**API:** 4 analysis endpoints + 6 admin observability endpoints

**Schema:** `analysis_jobs`, `analysis_results`, `analysis_step_scores`, `analysis_frames`

---

## 5. Rubrics

| Capability | Detail |
|------------|--------|
| Manual creation | Step-by-step rubric builder with weights, required flags |
| AI-generated rubrics | Generate rubric from: task description, existing recording, template, or reference video |
| Rubric steps | Title, description, weight (1-10), required flag, evidence type (speech/visual/both) |
| Template calibration | Reference recordings used to calibrate scoring accuracy |
| Rubric versioning | Templates store rubric configs for reuse |

**API:** 7 rubric generation endpoints (from description, recording, template, video, refinement)

---

## 6. Reviews & Feedback

| Capability | Detail |
|------------|--------|
| Human review | Managers review AI analysis results |
| Review comments | Threaded comments on reviews |
| Feedback submission | Structured feedback back to contributor |
| Review statuses | Tracks review lifecycle |

**API:** 5 endpoints — CRUD, feedback submission

**Schema:** `reviews`, `review_comments`

---

## 7. Multi-Tenancy & Organizations

| Capability | Detail |
|------------|--------|
| Organizations | Full multi-tenant isolation via `organization_id` on all tables |
| Row-Level Security | PostgreSQL RLS policies enforce tenant boundaries at DB level |
| Org creation | Auto-created on signup (enterprise email → domain-named org) |
| Member management | Invite, remove, role changes, status tracking |
| Roles | `owner → admin → manager → employee` (RBAC) |
| Invitations | Email invitations with token validation, accept/reject flows |
| Domain verification | Email-based and DNS-based domain claiming |
| Domain auto-join | Users with verified domain auto-matched to org |
| Per-org storage buckets | Dedicated R2 bucket provisioning per org (`organization_buckets`) |
| Org settings | Configurable per-org (logo, name, domain, etc.) |
| Org switching | Users can belong to multiple orgs, switch context |

**API:** 40+ endpoints across org, member, invitation, domain verification routes

**Schema:** `organizations`, `organization_members`, `organization_invitations`, `organization_buckets`, `domain_verification_requests`

---

## 8. Authentication & Security

| Capability | Detail |
|------------|--------|
| Email/password | bcrypt hashing, validation |
| Google OAuth | Full OAuth2 flow (login + signup) |
| Microsoft / Entra ID OAuth | Full OAuth2 flow (login + signup + invitation acceptance) |
| Magic links | Token-based access for external contributors (no account) |
| JWT | Access tokens (in-memory, short-lived) + refresh tokens (HttpOnly cookies, family rotation) |
| CSRF | Double-submit cookie pattern via `csrf-csrf` |
| Rate limiting | 4-layer: anonymous IP → authenticated user → authenticated IP → quota enforcer |
| API keys | Per-org API keys with scopes for programmatic access |
| Impersonation | System admin can impersonate any org (audit-logged) |
| Session management | Refresh token blacklisting, parallel revocation |
| Helmet | Full CSP, HSTS preload, X-Frame-Options |

**Schema:** `refresh_tokens`, `api_keys`, `admin_impersonation_tokens`, `impersonation_logs`

---

## 9. Billing & Subscriptions (Stripe)

| Capability | Detail |
|------------|--------|
| Pricing tiers | Free, Pro, Enterprise (admin-configurable, DB-driven) |
| Stripe Checkout | Hosted checkout sessions for upgrades |
| Stripe Billing Portal | Self-service billing management |
| Subscriptions | Create, update, cancel (at period end), reactivate |
| Trials | Configurable trial period (default 14 days) |
| Invoices | List, retrieve, upcoming invoice preview |
| Payment methods | Add, remove, set default |
| Webhook handling | Stripe webhook verification + event processing |
| Usage tracking | Per-org feature usage against tier limits |
| Feature gating | `requireFeature()` middleware enforces tier access |
| Enterprise billing | Manual invoicing, custom subscriptions for enterprise orgs |
| Tier management | Admin UI for creating/editing/archiving/reordering tiers |
| Stripe sync | Auto-sync products and prices to Stripe |

**API:** 20+ billing endpoints + 15+ admin pricing endpoints

**Schema:** `pricing_tiers`, `organization_subscriptions`, `checkout_sessions`, `invoices`, `payment_methods`, `billing_events`, `stripe_webhook_events`, `tier_audit_logs`

---

## 10. Dashboard & Analytics

| Capability | Detail |
|------------|--------|
| Org dashboard | Task counts, completion rates, recent activity |
| Task statistics | By status, by period, trends |
| Performance metrics | Manager/admin view of team performance |
| Cohort benchmarking | Per-task avg scores, score distributions, pass rates, leaderboard |
| Activity feed | Recent actions across the org |
| CSV export | Org-wide data export (tasks + recordings + analysis results) |

**API:** 6 endpoints — stats, task statistics, performance, activity, cohort, export

---

## 11. Admin System (System Admin Only)

| Capability | Detail |
|------------|--------|
| Org management | List, create, suspend/unsuspend, delete orgs |
| Tier management | Full pricing tier CRUD with Stripe sync |
| Feature grants | Override tier features for specific orgs |
| Trial management | Extend, start, end trials for orgs |
| System settings | Configure trial duration, global settings |
| AI prompt editor | Edit, test, revert, reset AI analysis prompts (versioned) |
| Video upload | Admin can upload reference videos to tasks |
| Observability | Analysis health dashboard, performance metrics, variance alerts, per-analysis debug logs |
| Impersonation | Impersonate any org for debugging (audit-logged) |
| System admin management | Grant/revoke system admin role (primary admin only) |
| Audit logs | Per-org and system-wide audit log viewing |

**API:** 50+ admin endpoints

---

## 12. Storage & Retention

| Capability | Detail |
|------------|--------|
| Storage metrics | Per-org storage usage tracking |
| Quota alerts | Configurable alerts when approaching storage limits |
| Retention policies | Configurable recording retention (auto-delete after N days) |
| Policy enforcement | Manual or scheduled retention enforcement |
| Execution history | Audit trail of retention policy runs |

**API:** 12 endpoints — metrics, usage, quota alerts, retention policies

**Schema:** `storage_metrics`, `storage_quota_alerts`, `recording_retention_policies`, `retention_execution_logs`

---

## 13. Notifications

| Capability | Detail |
|------------|--------|
| In-app notifications | Bell icon with unread count |
| Notification preferences | Per-user, per-type notification settings |
| Read/unread management | Mark individual or all as read |
| Email notifications | Queue-based email delivery (BullMQ) |

**API:** 9 endpoints — list, unread count, read/unread, preferences, delete

**Schema:** `notifications`, `notification_preferences`

---

## 14. Search

| Capability | Detail |
|------------|--------|
| Full-text search | Across tasks, recordings, users, templates |
| Filtered search | By type, status, date range |
| Search suggestions | Auto-complete for search terms |
| Transcript search | Search within recording transcripts |

**API:** 6 endpoints

---

## 15. API Metrics & Usage

| Capability | Detail |
|------------|--------|
| Usage tracking | Per-endpoint, per-user API call tracking |
| Feature usage | Track which features are used per org |
| Rate limit monitoring | View current rate limit status |
| API keys | Create, list, revoke API keys for programmatic access |

**API:** 7 endpoints

**Schema:** `api_metrics`, `api_usage_summary`, `feature_usage`, `rate_limit_rules`, `rate_limit_violations`

---

## 16. External Contributor Flow (Magic Links)

| Capability | Detail |
|------------|--------|
| Public task page | Branded landing page for external contributors |
| No account required | Magic link grants access to specific task |
| Task claiming | Contributor enters name + email to claim |
| Rubric preview | Shows evaluation criteria before recording |
| Progress stepper | Visual progress: Confirmed → Record → Submit |
| Chunked recording | Full multipart upload from public page |
| Submission confirmation | "What happens next" flow after submission |
| Contributor tracking | `external_contributors` table, analytics per contributor |

**API:** 12 magic link endpoints — validate, claim, upload, multipart lifecycle, contributor analytics

---

## 17. Onboarding

| Capability | Detail |
|------------|--------|
| Signup with org | Create account + org in one step |
| Invitation join | Accept invitation during signup |
| Onboarding status | Track completion of onboarding steps |
| Default template provisioning | System templates auto-provisioned on org creation |

**API:** 4 endpoints

---

## Data Model Summary

**52 database tables** across:
- Core: `users`, `organizations`, `tasks`, `recordings`, `reviews`
- AI Pipeline: `analysis_jobs`, `analysis_results`, `analysis_step_scores`, `analysis_frames`, `transcription_jobs`, `transcription_segments`
- Billing: `pricing_tiers`, `organization_subscriptions`, `checkout_sessions`, `invoices`, `payment_methods`, `billing_events`
- Security: `refresh_tokens`, `api_keys`, `impersonation_logs`, `rate_limit_rules`
- Storage: `organization_buckets`, `storage_metrics`, `recording_retention_policies`
- Audit: `organization_audit_logs`, `activity_logs`, `tier_audit_logs`

---

## Infrastructure

| Component | Technology |
|-----------|-----------|
| Frontend | React + TypeScript + Vite + Tailwind CSS → **Vercel** (cogveri.com) |
| Backend | Node.js + TypeScript + Express → **AWS EC2** (api.cogveri.com) |
| Database | PostgreSQL 15 (with RLS) |
| Cache/Queue | Redis 7 + BullMQ |
| Storage | Cloudflare R2 (S3-compatible) |
| Transcription | Python worker (Whisper) |
| AI Analysis | Google Gemini |
| Auth | JWT + Google OAuth + Microsoft OAuth + Magic Links |
| Payments | Stripe |
| CDN/DNS | Cloudflare |
| Monitoring | Sentry |
| CI/CD | GitHub Actions → Docker → GHCR → EC2 |

---

## API Surface

**320 endpoints** across 35+ route files covering:
- Auth (12 endpoints)
- Tasks (12 endpoints)
- Templates (9 endpoints)
- Recordings (14 endpoints)
- Reviews (5 endpoints)
- Dashboard (6 endpoints)
- Billing (20+ endpoints)
- Organizations (10+ endpoints)
- Members (12 endpoints)
- Invitations (7 endpoints)
- Search (6 endpoints)
- Transcription (10 endpoints)
- Analysis (4 endpoints)
- Rubric Generation (7 endpoints)
- Magic Links (12 endpoints)
- Notifications (9 endpoints)
- Storage & Retention (12 endpoints)
- Metrics (7 endpoints)
- Admin (50+ endpoints)
- Domain Verification (10 endpoints)
- Health (6 endpoints)

---

## BullMQ Async Queues

| Queue | Purpose |
|-------|---------|
| `email` | Transactional email delivery |
| `transcription` | Whisper transcription jobs |
| `transcode` | Video transcoding to web-compatible formats |
| `thumbnail` | Video thumbnail generation |
| `analysis` | AI analysis pipeline (Gemini) |
| `rubric-generation` | AI rubric generation from content |

---

## What's NOT Built Yet

| Feature | Status |
|---------|--------|
| SAML/SSO | Schema columns exist, not implemented (Google + Microsoft OAuth work) |
| Webhooks to orgs | `api_keys` with scopes exist, no outbound webhook delivery |
| Mobile recording | Desktop Screen Capture API only |
| LMS integrations | No SCORM/xAPI support |
| Custom branding | Org logo in schema, no white-label theming |
| Comparative analytics over time | Data exists (`attempt_number`), no UI |
| Recording download | Endpoint stubbed but not implemented |
| Recording deletion | Endpoint stubbed but not implemented |
