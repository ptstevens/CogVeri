# CogVeri Product Features

> **Last Updated:** January 2025
> **Version:** 1.0

CogVeri is a multi-tenant SaaS platform for screen recording, task assignment, and AI-powered video analysis. Organizations can assign recording tasks, external contributors submit via magic links (no account required), and reviewers provide feedback with AI assistance.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Multi-Tenant Organizations](#2-multi-tenant-organizations)
3. [Task Management](#3-task-management)
4. [Magic Links (External Contributors)](#4-magic-links-external-contributors)
5. [Recordings & Video Processing](#5-recordings--video-processing)
6. [Transcription](#6-transcription)
7. [AI Analysis](#7-ai-analysis)
8. [Reviews & Feedback](#8-reviews--feedback)
9. [Search](#9-search)
10. [Notifications](#10-notifications)
11. [Billing & Subscriptions](#11-billing--subscriptions)
12. [Pricing Tiers & Feature Limits](#12-pricing-tiers--feature-limits)
13. [Storage & Retention](#13-storage--retention)
14. [API Metrics & Rate Limiting](#14-api-metrics--rate-limiting)
15. [Audit Logging](#15-audit-logging)
16. [Onboarding](#16-onboarding)
17. [Dashboard & Analytics](#17-dashboard--analytics)
18. [User Management](#18-user-management)
19. [System Administration](#19-system-administration)
20. [Real-Time Features](#20-real-time-features)
21. [Background Jobs](#21-background-jobs)

---

## 1. Authentication & Authorization

### 1.1 User Authentication

Core authentication system with multiple sign-in methods.

**Capabilities:**

- Email/password registration and login
- Google OAuth 2.0 SSO integration
- JWT access tokens with refresh token rotation
- CSRF protection with token-based validation
- Rate-limited authentication endpoints
- Signup protection with "coming soon" mode (controlled by `OPEN_FOR_BUSINESS` flag)
- Admin secret token bypass for closed signups

### 1.2 Token Management

Secure token handling for authentication sessions.

**Capabilities:**

- Access token generation and validation
- Refresh token rotation for security
- Token blacklisting for logout
- Organization context switching without re-login

### 1.3 User Impersonation (Admin)

System admins can impersonate users for support purposes.

**Capabilities:**

- Start/end impersonation sessions
- Impersonation audit logging
- Impersonation status tracking
- Restricted actions during impersonation

---

## 2. Multi-Tenant Organizations

### 2.1 Organization Management

Multi-tenant organization structure with role-based access.

**Capabilities:**

- Create, read, update, delete organizations
- Organization settings management
- Quota status monitoring (storage, members, tasks, videos)
- Rate limit status tracking
- Organization switching for multi-org users

### 2.2 Member Management

Full member lifecycle management within organizations.

**Capabilities:**

- List organization members with pagination
- Invite users via email with configurable roles
- Accept/reject invitations
- Resend/cancel pending invitations
- Change member roles
- Activate/deactivate members
- Remove members from organization
- Transfer organization ownership

**Supported Roles:**

| Role     | Description                                          |
| -------- | ---------------------------------------------------- |
| Owner    | Full control, billing access, can transfer ownership |
| Admin    | Manage members, settings, tasks                      |
| Limited  | Create and manage own tasks                          |
| Viewer   | View-only access                                     |
| Reviewer | Review submitted recordings                          |

### 2.3 Organization Invitations

Invitation system for adding members to organizations.

**Capabilities:**

- Create and send invitations with role assignment
- Validate invitation tokens (public endpoint)
- Accept/reject invitations
- List organization invitations by status
- Revoke pending invitations
- Get user's pending invitations

### 2.4 Domain Verification

Domain ownership verification for organizations.

**Capabilities:**

- Email-based domain verification (sends code to admin@domain)
- DNS TXT record verification
- Domain availability checking
- Domain claiming status for upgrades
- Instant domain claim (when user email matches)
- Retry failed verification attempts
- Cancel pending verifications

**Verification Methods:** Email verification, DNS TXT record

### 2.5 Subscriber Email Management

Billing subscriber email management and transfer.

**Capabilities:**

- View current subscriber email and verification status
- Initiate subscriber email transfer with email verification
- Accept transfer via verification token
- Cancel pending transfers
- View transfer history
- Admin override for emergencies

---

## 3. Task Management

### 3.1 Task CRUD

Complete task lifecycle management.

**Capabilities:**

- Create, read, update, delete tasks
- Task filtering by status, priority, assignee
- Task statistics and analytics
- Task progress updates
- Task submission workflow
- Task review submission

### 3.2 Task Templates

Reusable task templates for consistent task creation.

**Capabilities:**

- CRUD operations for organization templates
- System default templates (read-only)
- Restore deleted system defaults
- Template-based task creation

---

## 4. Magic Links (External Contributors)

### 4.1 Magic Link System

Secure token-based access for external contributors without accounts.

**Capabilities:**

- Create magic links for task assignment
- Validate tokens with rate limiting
- Get task details via token (public endpoint)
- Claim tasks with contributor information
- Submit recordings via magic link
- Revoke tokens
- Token expiration and max-use limits
- Automatic email notification to contributors

### 4.2 External Contributor Management

Track and manage external contributors.

**Capabilities:**

- List external contributors with search
- Contributor analytics (completion rate, success rate, average time)
- Task history per contributor
- Activity logging

### 4.3 Public Recording Upload

Multipart upload for magic link users.

**Capabilities:**

- Check multipart upload availability
- Initiate multipart uploads
- Get presigned URLs for parts
- Register uploaded parts
- Complete/abort multipart uploads

---

## 5. Recordings & Video Processing

### 5.1 Recording Management

Video recording creation and management.

**Capabilities:**

- Create recording metadata
- List recordings with filters (task_id, user_id, status)
- Get single recording details
- Get playback URLs (signed S3 URLs)
- Get processing status (transcoding, transcription)

### 5.2 Multipart Upload

Chunked upload system for large video files.

**Capabilities:**

- Check upload availability
- Initiate upload sessions
- Get presigned URLs for chunks
- Register uploaded parts
- Complete multipart uploads
- Abort failed uploads
- Track active upload sessions
- Get session status

### 5.3 Video Transcoding

Background video format conversion.

**Capabilities:**

- Automatic format conversion via ffmpeg
- Quality optimization
- Progress tracking via background jobs

### 5.4 Thumbnail Generation

Automatic video thumbnail creation.

**Capabilities:**

- Extract frames from video
- Generate thumbnail images
- S3 storage integration

---

## 6. Transcription

### 6.1 Speech-to-Text Transcription

AI-powered video transcription.

**Capabilities:**

- Start transcription for recordings
- Check transcription status
- Get full transcription text
- Get transcription segments with timestamps
- Get segment at specific time
- Cancel pending transcription
- Retry failed transcription
- View transcription job history
- Feature access checking by tier

**Integration:** OpenAI Whisper (Python worker) or Node.js worker

### 6.2 Transcription Callback

API for external transcription workers.

**Capabilities:**

- Receive transcription results from Python worker
- Process segments with timing information
- API key authentication

---

## 7. AI Analysis

### 7.1 Video Analysis Pipeline

AI-powered rubric-based video assessment.

**Capabilities:**

- Trigger analysis on recordings (Pro+ tier)
- Get analysis results
- Get analysis progress/status
- Export analysis results

**Pipeline Stages:**

1. Frame extraction from video
2. Speech analysis via transcription
3. Visual analysis via Google Gemini
4. Score combination and verdict calculation

### 7.2 Speech Analysis

Analyze transcribed speech against rubric criteria.

**Capabilities:**

- Transcript analysis against rubric steps
- Evidence extraction from speech
- Confidence scoring

### 7.3 Visual Analysis

Analyze video frames against visual criteria.

**Capabilities:**

- Frame extraction at configurable intervals
- Visual evidence detection via Google Gemini
- Multi-frame analysis

### 7.4 AI Rubric Generation

Generate assessment rubrics from sample videos (Pro+ tier).

**Capabilities:**

- Upload sample video for rubric generation
- Automatic transcription of sample
- AI-powered rubric step extraction
- Task type and context customization
- Generation progress tracking
- Cleanup temporary videos

### 7.5 Analysis Export

Export analysis results.

**Capabilities:**

- PDF export of analysis results
- Summary generation
- Strengths and improvements identification

---

## 8. Reviews & Feedback

### 8.1 Review Management

Review workflow for submitted recordings.

**Capabilities:**

- Create reviews
- List reviews
- Get review details
- Update reviews
- Submit feedback on reviews

---

## 9. Search

### 9.1 Full-Text Search

Global search across platform entities.

**Capabilities:**

- Global search across tasks, recordings, transcripts
- Task-specific search with status/priority filters
- Recording search (searches transcripts)
- Transcript segment search within recordings
- Search suggestions/autocomplete
- Admin search index refresh

---

## 10. Notifications

### 10.1 In-App Notifications

Real-time notification system.

**Capabilities:**

- Get all notifications with pagination
- Get unread notification count
- Get unread notifications
- Mark single notification as read
- Mark all notifications as read
- Delete notifications
- WebSocket real-time updates

### 10.2 Notification Preferences

User notification settings.

**Capabilities:**

- Get notification preferences
- Update preferences (email, push, in-app)
- Digest frequency settings (immediate, daily, weekly, never)
- Quiet hours configuration
- Timezone settings

### 10.3 Email Notifications

Transactional email system.

**Email Types:**

- Task assignment notifications
- Magic link emails
- Organization invitation emails
- Billing/dunning emails
- Payment action required emails
- Task approval/rejection emails
- Task reminder emails

---

## 11. Billing & Subscriptions

### 11.1 Subscription Management

Stripe-integrated subscription system.

**Capabilities:**

- Get current subscription details
- Get usage against tier limits
- Create Stripe checkout sessions
- Create Stripe billing portal sessions
- Update subscription tier
- Cancel subscription (immediate or at period end)
- Reactivate canceled subscription
- Manual subscription sync from Stripe

### 11.2 Payment Methods

Payment method management.

**Capabilities:**

- List payment methods
- Add new payment methods
- Set default payment method
- Remove payment methods

### 11.3 Invoices

Invoice management.

**Capabilities:**

- List past invoices with pagination
- Get single invoice details
- Preview upcoming invoice/charge

### 11.4 Billing Contact

Organization billing contact management.

**Capabilities:**

- Get billing contact information
- Update billing contact (email, name)
- Separate billing contact from subscriber

### 11.5 Trial Management

Free trial handling.

**Capabilities:**

- Start trial on specific tier
- Trial status checking
- Trial days remaining calculation
- Automatic trial expiration handling

**Trial Period:** 14 days (configurable)

### 11.6 Stripe Webhooks

Real-time Stripe event processing.

**Capabilities:**

- Signature verification
- Subscription lifecycle events
- Payment success/failure handling
- Invoice events
- Automatic tier sync

### 11.7 Dunning Emails

Failed payment notification system.

**Capabilities:**

- Progressive urgency based on failure count
- Next retry date information
- Direct invoice payment links
- CC to subscriber if billing contact differs

---

## 12. Pricing Tiers & Feature Limits

### 12.1 Pricing Tiers

Tiered pricing with feature gating.

| Tier       | Price   | Members   | Storage   | Videos/mo | Key Features                                |
| ---------- | ------- | --------- | --------- | --------- | ------------------------------------------- |
| Free       | $0/mo   | 2         | 5GB       | 5         | Basic transcription                         |
| Team       | $25/mo  | 10        | 100GB     | Unlimited | Basic AI analysis                           |
| Pro        | $65/mo  | 50        | 500GB     | Unlimited | Full AI rubric scoring, templates, webhooks |
| Business   | $125/mo | 150       | 1TB       | Unlimited | API access, SSO, audit logs                 |
| Enterprise | Custom  | Unlimited | Unlimited | Unlimited | Dedicated CSM, custom domain, SCIM          |

### 12.2 Feature Access Control

Feature gating based on subscription tier.

**Capabilities:**

- Check feature access by tier
- Check organization-specific feature access (with custom overrides)
- Quota enforcement middleware
- Trial write access enforcement

### 12.3 Usage Tracking

Track organization usage against limits.

**Tracked Metrics:**

- Member count
- Storage usage (GB)
- Monthly task count
- Monthly video count
- External contributor count
- Usage warnings at 80% threshold

---

## 13. Storage & Retention

### 13.1 Storage Metrics

Storage usage monitoring.

**Capabilities:**

- Get storage metrics for organization
- Get detailed storage usage breakdown
- Recalculate storage metrics
- Check storage alerts

### 13.2 Storage Quota Alerts

Configurable storage threshold alerts.

**Capabilities:**

- Create quota alerts at specific thresholds
- List active alerts
- Update alert configurations
- Delete alerts

### 13.3 Retention Policies

Automated data retention management.

**Capabilities:**

- Create retention policies
- List organization policies
- Update policy settings
- Delete policies
- Set default policy
- Enforce retention policy
- Bulk enforcement
- Policy execution history

---

## 14. API Metrics & Rate Limiting

### 14.1 Usage Metrics

API usage analytics.

**Capabilities:**

- Get usage summary
- Usage breakdown by endpoint
- Usage breakdown by user
- Feature usage tracking

### 14.2 API Keys

API key management for programmatic access.

**Capabilities:**

- Create API keys
- List API keys
- Revoke API keys

### 14.3 Rate Limiting

Tier-based API rate limiting.

**Capabilities:**

- Per-user rate limits
- Tier-based limit configuration
- Rate limit status checking
- Cache invalidation on tier change

---

## 15. Audit Logging

### 15.1 Audit Logs

Comprehensive activity tracking.

**Capabilities:**

- Retrieve audit logs with filters (action, resource type, date range)
- Get individual log details
- Audit statistics
- Export audit logs
- Organization-specific audit log access

---

## 16. Onboarding

### 16.1 User Onboarding

New user and organization setup flow.

**Capabilities:**

- Signup with organization creation (single transaction)
- Join organization via invitation
- Mark onboarding complete with preferences
- Get onboarding status

---

## 17. Dashboard & Analytics

### 17.1 Dashboard Statistics

Overview metrics for organization.

**Capabilities:**

- Get overall dashboard statistics
- Task statistics with period filters
- Performance metrics (managers only)
- Activity feed

---

## 18. User Management

### 18.1 User Profile

User account management.

**Capabilities:**

- Get current user details
- Update user profile
- Update notification preferences
- List organization users
- Get specific user details
- Update user (admin)

---

## 19. System Administration

### 19.1 Admin Dashboard

System-wide administration.

**Capabilities:**

- List all organizations
- Get organization details
- System-wide metrics
- Suspend/unsuspend organizations
- View organization audit logs
- Admin impersonation

### 19.2 Stripe Sync (Admin)

Manual Stripe synchronization.

**Capabilities:**

- Sync single organization from Stripe
- Sync all organizations from Stripe
- Handle webhook failures

### 19.3 Feature Overrides (Admin)

Custom feature/limit configuration per organization.

**Capabilities:**

- Get organization feature overrides
- Update feature overrides
- Get organization limit overrides
- Update limit overrides
- Reset to tier defaults

### 19.4 Pricing Tier Management (Admin)

Admin control over pricing tiers.

**Capabilities:**

- View all tiers (including inactive)
- Create new tiers
- Update tier settings, limits, features
- Activate/deactivate tiers
- Reorder tiers

### 19.5 Enterprise Management (Admin)

Enterprise customer administration.

**Capabilities:**

- List enterprise organizations
- Get enterprise details
- Apply enterprise plan with custom limits/features
- Update enterprise configuration
- Remove enterprise plan (revert to standard tier)
- Get enterprise template (all unlimited)

**Enterprise Invoicing:**

- Create and send enterprise invoices
- Create custom recurring subscriptions
- List organization invoices
- Void unpaid invoices
- Mark invoices as paid (offline payments)

---

## 20. Real-Time Features

### 20.1 WebSocket (Socket.IO)

Real-time communication infrastructure.

**Capabilities:**

- Notification real-time updates
- Unread count synchronization
- Recording progress updates
- Analysis status updates

---

## 21. Background Jobs

### 21.1 Job Queues

Asynchronous job processing via BullMQ.

| Queue         | Purpose                        |
| ------------- | ------------------------------ |
| send-email    | Transactional email delivery   |
| transcription | Video transcription processing |
| transcode     | Video format conversion        |
| thumbnail     | Thumbnail image generation     |
| analysis      | AI-powered video analysis      |

---

## Application Pages

### Public Pages

| Page              | Path                      | Description            |
| ----------------- | ------------------------- | ---------------------- |
| Landing           | `/`                       | Marketing homepage     |
| Pricing           | `/pricing`                | Pricing plans display  |
| Enterprise        | `/enterprise`             | Enterprise sales page  |
| Login             | `/login`                  | User authentication    |
| Register          | `/register`               | New user registration  |
| OAuth Callback    | `/auth/callback`          | Google OAuth handler   |
| Join Organization | `/auth/join-organization` | Accept invitation      |
| Privacy Policy    | `/privacy`                | Legal - privacy policy |
| Terms of Service  | `/terms`                  | Legal - terms          |
| Public Task       | `/t/:token`               | Magic link task view   |

### Protected Pages

| Page                  | Path                                | Description                |
| --------------------- | ----------------------------------- | -------------------------- |
| Dashboard             | `/dashboard`                        | Organization overview      |
| Tasks                 | `/tasks`                            | Task list and management   |
| Task Detail           | `/tasks/:id`                        | Single task view           |
| Task Review           | `/tasks/:taskId/review`             | Review submitted recording |
| Live Session          | `/tasks/:taskId/live`               | Live demo session          |
| Recordings            | `/record`                           | Recording list             |
| Recording Session     | `/record/new`, `/record/:id`        | Create/view recording      |
| Analysis Results      | `/recordings/:recordingId/analysis` | AI analysis view           |
| Rubric Builder        | `/templates/:templateId/rubric`     | Build assessment rubric    |
| Reviews               | `/reviews`                          | Review list                |
| Review Detail         | `/reviews/:id`                      | Single review view         |
| Profile               | `/profile`                          | User profile settings      |
| Organization Settings | `/organizations/settings`           | Org configuration          |
| Knowledge Base        | `/knowledge-base`                   | Help documentation         |

### Admin Pages

| Page                | Path                                   | Description          |
| ------------------- | -------------------------------------- | -------------------- |
| Admin Dashboard     | `/admin`                               | System overview      |
| Admin Organizations | `/admin/organizations`                 | Manage all orgs      |
| Admin Org Detail    | `/admin/organizations/:organizationId` | Single org admin     |
| Admin Pricing       | `/admin/pricing`                       | Manage pricing tiers |

---

## Feature Summary

| Category                       | Feature Count |
| ------------------------------ | ------------- |
| Authentication & Authorization | 3             |
| Multi-Tenant Organizations     | 5             |
| Task Management                | 2             |
| Magic Links                    | 3             |
| Recordings & Video             | 4             |
| Transcription                  | 2             |
| AI Analysis                    | 5             |
| Reviews                        | 1             |
| Search                         | 1             |
| Notifications                  | 3             |
| Billing & Subscriptions        | 7             |
| Pricing & Limits               | 3             |
| Storage & Retention            | 3             |
| API Metrics                    | 3             |
| Audit Logging                  | 1             |
| Onboarding                     | 1             |
| Dashboard                      | 1             |
| User Management                | 1             |
| System Administration          | 5             |
| Real-Time (WebSocket)          | 1             |
| Background Jobs                | 5             |
| **Total Major Features**       | **60**        |
