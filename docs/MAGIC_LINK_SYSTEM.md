# Magic Link System - Implementation Guide

## Overview
The Magic Link system allows task creators to send secure, time-limited links to external contributors who can access and complete tasks without creating a full user account.

## Backend Implementation ✅ COMPLETE

### Database Schema

#### `external_contributors` Table
Stores information about people who access tasks via magic links:
- `id` - UUID primary key
- `email` - Email address (unique, indexed)
- `first_name`, `last_name` - Names (collected on first claim)
- `total_tasks_assigned`, `total_tasks_completed`, `total_tasks_rejected` - Analytics
- `average_completion_time_seconds` - Performance tracking
- `last_active_at` - Last activity timestamp

#### `task_access_tokens` Table
Secure tokens for passwordless access:
- `id` - UUID primary key
- `task_id` - References tasks table
- `token` - Cryptographically secure random token (64 chars hex, indexed)
- `email` - Assignee email (indexed)
- `contributor_id` - Links to external_contributors
- `expires_at` - Expiration timestamp (set by task creator)
- `max_uses` - Optional usage limit
- `current_uses` - Usage counter
- `is_revoked` - Revocation flag
- `ip_address`, `user_agent` - Security tracking

#### `task_access_logs` Table
Audit trail and analytics:
- Records all actions: 'viewed', 'claimed', 'started_recording', 'submitted', 'downloaded'
- Tracks IP, user agent, timestamps, custom metadata
- Used for contributor analytics and security monitoring

#### `tasks` Table Updates
New fields:
- `access_token_expires_days` - Expiry setting from creator
- `is_external_task` - Boolean flag
- `external_contributor_id` - Links to external_contributors
- `claimed_at` - When task was claimed
- `claim_name`, `claim_email` - Claim information

### API Endpoints

#### Public Endpoints (No Authentication)
```
GET  /api/magic-links/validate/:token
     - Validates token and returns task access info

GET  /api/magic-links/task/:token
     - Returns full task details for a valid token

POST /api/magic-links/claim/:token
     Body: { firstName, lastName, email }
     - Claims a task (sets name, updates task status to in_progress)
```

#### Protected Endpoints (Requires Authentication)
```
POST   /api/magic-links
       Body: { taskId, email, expiresInDays, maxUses? }
       - Creates a magic link for a task
       - Returns: { token, url }

DELETE /api/magic-links/revoke/:taskId
       - Revokes all tokens for a task (creator or admin only)

GET    /api/magic-links/contributors?search=&limit=50
       - Lists external contributors for dropdown selection

GET    /api/magic-links/contributors/:contributorId/analytics
       - Returns detailed analytics for a contributor
```

### Services

#### `magicLinkService`
Core methods:
- `createMagicLink()` - Generates secure token, creates DB records, marks task as external
- `validateToken()` - Checks expiry, revocation, usage limits; logs access
- `claimTask()` - Verifies email, updates contributor name, marks task claimed
- `getTaskByToken()` - Public task retrieval
- `revokeToken()` - Revokes all tokens for a task
- `getExternalContributors()` - Searchable contributor list
- `getContributorAnalytics()` - Stats and history

Security features:
- 256-bit cryptographically secure random tokens
- Automatic token uniqueness verification
- IP and user agent tracking
- Comprehensive audit logging

### Email Integration
When a magic link is created, the system should send an email with:
- The magic link URL: `https://yourapp.com/t/{token}`
- Task title and description
- Expiry date
- Instructions

(Email sending needs to be integrated with your existing email service)

## Frontend Implementation 🚧 TODO

### Required Components

#### 1. Update CreateTaskModal
Add fields:
```typescript
- Assignee Type: Radio buttons ("Existing User" | "External Link")
- If External Link:
  - Email input (validated)
  - Link expiry dropdown (1, 7, 14, 30, 60, 90 days)
  - Max uses (optional)
  - "Generate & Send Link" button
```

Show generated link in a copyable text box after creation.

#### 2. Public Task Page (`/t/:token`)
Route: `/t/:token` (public, no auth required)

Flow:
1. **Landing** - Show task title, creator name, "Get Started" button
2. **Claim Form** - Collect: First Name, Last Name, Email (must match token)
3. **Task View** - Full task details with recording capability
4. **Submit** - Upload recording, submit for review

Components needed:
- `PublicTaskLanding.tsx` - Initial landing page
- `ClaimTaskForm.tsx` - Name/email collection
- `PublicTaskView.tsx` - Main task interface (similar to authenticated view)
- `PublicRecordingSession.tsx` - Recording without auth

#### 3. Task Management Updates
- Show "External" badge on external tasks
- Display claim status ("Unclaimed" | "Claimed by John Doe")
- Show expiry countdown
- "Revoke Link" button
- "Copy Link" button

### API Service (`magicLink.service.ts`)
```typescript
export class MagicLinkService {
  async createMagicLink(data: CreateMagicLinkDto): Promise<{token, url}>
  async validateToken(token: string): Promise<ValidationResult>
  async getTaskByToken(token: string): Promise<TaskDetails>
  async claimTask(token: string, data: ClaimData): Promise<ClaimResult>
  async revokeToken(taskId: string): Promise<void>
  async getContributors(search?: string): Promise<Contributor[]>
  async getContributorAnalytics(id: string): Promise<Analytics>
}
```

### Routing Updates
Add to `App.tsx`:
```typescript
// Public route (no auth required)
<Route path="/t/:token" element={<PublicTaskPage />} />
```

## User Workflows

### Task Creator Workflow
1. Click "Create Task"
2. Select "Send as External Link"
3. Enter assignee email
4. Choose expiry (default 30 days)
5. Click "Create & Send Link"
6. System shows: "Link sent to john@example.com - expires in 30 days"
7. Creator can copy link to share via other channels
8. Creator sees task in list with "External" badge
9. When claimed, shows "Claimed by John Doe on [date]"

### External Contributor Workflow
1. Receives email with magic link
2. Clicks link → lands on `/t/{token}`
3. Sees task overview: "You've been invited to complete a task"
4. Clicks "Get Started"
5. Form appears: "Please confirm your details"
   - First Name
   - Last Name
   - Email (pre-filled, must match invitation)
6. Submits → Task status changes to "in_progress"
7. Sees full task details and recording interface
8. Can record screen + audio
9. Submits recording
10. Sees confirmation: "Thanks! Your recording has been submitted for review"
11. Can return to same link to check status/resubmit if rejected

### Reviewer Workflow
- Reviews recording as normal
- If rejected, external contributor receives email
- Can resubmit via same magic link (until expiry)

## Security Considerations

✅ Implemented:
- Cryptographically secure token generation (crypto.randomBytes)
- Token expiration checking
- Usage limit enforcement
- Revocation support
- IP and user agent tracking
- Email verification on claim
- Comprehensive audit logging

🔒 Additional Security (Optional Future Enhancements):
- Rate limiting on token validation endpoint
- IP binding (token only works from first IP used)
- Device fingerprinting
- Two-factor email verification
- Automatic expiry after first completion

## Analytics & Reporting

Contributor metrics tracked:
- Total tasks assigned/completed/rejected
- Completion rate percentage
- Success rate (completed vs rejected)
- Average completion time
- Last active date
- Recent activity log

Access when viewing external contributors list or individual analytics page.

## Testing Checklist

### Backend Tests ✅
- [x] Database migration runs successfully
- [x] Token generation creates unique tokens
- [x] Token validation checks expiry
- [x] Token validation checks revocation
- [x] Max uses enforced
- [x] Claim updates contributor and task
- [x] Email mismatch rejected
- [x] Analytics calculated correctly
- [x] Audit logs created

### Frontend Tests 🚧
- [ ] Task creation with external link option
- [ ] Magic link displays and is copyable
- [ ] Public page loads with valid token
- [ ] Claim form validates email
- [ ] Claimed task shows recording interface
- [ ] Recording and submission work
- [ ] Expired token shows error
- [ ] Revoked token shows error
- [ ] Task list shows external badge
- [ ] Contributors dropdown populated

### Integration Tests 🚧
- [ ] End-to-end: Create → Send → Claim → Record → Submit
- [ ] Rejection flow: Submit → Reject → Resubmit
- [ ] Expiry: Token works before expiry, fails after
- [ ] Revocation: Creator revokes → link stops working
- [ ] Analytics update correctly after completion

## Next Steps

1. **Build Frontend Components** (Priority: High)
   - PublicTaskPage with claim flow
   - Update CreateTaskModal
   - Add magic link UI to task list

2. **Email Integration** (Priority: High)
   - Send magic link when task created
   - Send notification when task rejected (to allow resubmission)
   - Expiry warning emails (optional)

3. **UI Polish** (Priority: Medium)
   - External task badges and indicators
   - Countdown timer for expiry
   - Copy link button with clipboard API
   - Contributor management page

4. **Analytics Dashboard** (Priority: Low)
   - External contributor performance
   - Link usage statistics
   - Completion rates by contributor

## API Usage Examples

### Creating a Magic Link
```bash
curl -X POST http://localhost:3000/api/magic-links \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "123e4567-e89b-12d3-a456-426614174000",
    "email": "john@example.com",
    "expiresInDays": 30
  }'

# Response:
{
  "success": true,
  "data": {
    "token": "a1b2c3d4e5f6...",
    "url": "http://localhost:5173/t/a1b2c3d4e5f6..."
  }
}
```

### Validating a Token (Public)
```bash
curl http://localhost:3000/api/magic-links/validate/a1b2c3d4e5f6...

# Response:
{
  "success": true,
  "data": {
    "valid": true,
    "taskId": "123e4567-e89b-12d3-a456-426614174000",
    "email": "john@example.com",
    "contributorId": "..."
  }
}
```

### Claiming a Task (Public)
```bash
curl -X POST http://localhost:3000/api/magic-links/claim/a1b2c3d4e5f6... \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }'

# Response:
{
  "success": true,
  "data": {
    "task": { ... },
    "contributor": { ... }
  }
}
```

## Notes
- Backend is fully implemented and tested
- Database migrations have been run
- All API endpoints are live and functional
- Frontend implementation is the remaining work
- System is designed to be secure, scalable, and user-friendly
