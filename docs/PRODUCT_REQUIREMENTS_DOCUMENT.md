# Product Requirements Document (PRD)

# Revui - Multi-Tenant Screen Recording & Review SaaS Platform

**Document Version:** 1.0
**Last Updated:** January 2025
**Product:** Revui SaaS
**Status:** Draft - Greenfield Development

---

## 1. Executive Summary

### 1.1 Product Vision

Revui is a **multi-tenant SaaS platform** that enables organizations to assign, capture, review, and manage screen recordings as part of their workflow processes. It bridges the gap between task assignment and quality review by providing a comprehensive system where:

- **Internal teams** can create and assign screen recording tasks
- **External contributors** can submit recordings via secure magic links (no account required)
- **Reviewers** can provide feedback and approve/reject submissions
- **Administrators** can manage their organization, users, roles, and billing

### 1.2 Core Value Proposition

**For Organizations:**

- Streamline screen recording workflows for training, documentation, demos, and QA
- Maintain quality control through structured review processes
- Manage distributed teams and external contractors efficiently
- Secure, scalable, and cost-effective solution

**For Users:**

- Simple task assignment and tracking
- Intuitive recording interface (no software installation)
- Structured feedback and approval workflows
- Role-based access matching organizational hierarchy

**For External Contributors:**

- Frictionless contribution via magic links (no signup required)
- Professional recording tools in-browser
- Clear task requirements and submission confirmation

### 1.3 Target Market

**Primary:**

- **Software/SaaS Companies** - Product demos, bug reproduction, training videos
- **Digital Agencies** - Client deliverables, design reviews, process documentation
- **Training & Education** - Course content, student submissions, evaluations
- **Customer Success Teams** - Support documentation, customer onboarding videos

**Company Size:**

- Seed/Startup: 5-20 employees
- SMB: 20-200 employees
- Mid-Market: 200-1000 employees
- Enterprise: 1000+ employees (future)

### 1.4 Success Metrics

**Product Metrics:**

- Monthly Active Organizations (MAO)
- Monthly Active Users (MAU) per organization
- Average recordings per organization per month
- Task completion rate
- Review turnaround time (average hours from submission to review)

**Business Metrics:**

- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Churn Rate
- Net Promoter Score (NPS)

**Technical Metrics:**

- System uptime (target: 99.9%)
- Video upload success rate (target: >99%)
- Average video processing time
- API response time (p95 < 500ms)

---

## 2. User Personas

### 2.1 Primary Personas

#### **Persona 1: Organization Administrator (Sarah)**

**Demographics:**

- Age: 32-45
- Role: Operations Manager, IT Director, Team Lead
- Company: SMB (50-200 employees)
- Tech Savviness: High

**Goals:**

- Set up organization quickly
- Invite and manage team members
- Monitor team activity and usage
- Control costs and manage billing
- Ensure data security and compliance

**Pain Points:**

- Managing multiple tools for different workflows
- Difficulty tracking external contractor submissions
- Lack of visibility into team productivity
- Complex permission management

**User Stories:**

- "I need to onboard my entire team in under 30 minutes"
- "I want to see who's submitting recordings and when"
- "I need to control who can create tasks vs. who can only complete them"
- "I must ensure our recordings are secure and only accessible to authorized users"

---

#### **Persona 2: Task Manager (Marcus)**

**Demographics:**

- Age: 28-40
- Role: Project Manager, Team Lead, QA Manager
- Company: Startup/SMB (20-100 employees)
- Tech Savviness: Medium-High

**Goals:**

- Create and assign recording tasks to team members
- Track task progress and completion
- Review submitted recordings efficiently
- Provide clear feedback
- Manage external contributors/contractors

**Pain Points:**

- Email-based workflows are chaotic
- No centralized place to manage all recording requests
- Difficulty tracking which contractors completed which tasks
- Can't easily provide structured feedback

**User Stories:**

- "I need to send recording requests to 5 freelancers and track who's completed theirs"
- "I want to review recordings side-by-side with the original task requirements"
- "I need to provide time-stamped comments on specific parts of recordings"
- "I want notifications when recordings are submitted so I can review quickly"

---

#### **Persona 3: Internal Team Member (Alex)**

**Demographics:**

- Age: 24-35
- Role: Developer, Designer, Customer Success Rep, QA Tester
- Company: Any size
- Tech Savviness: Medium-High

**Goals:**

- See assigned recording tasks
- Complete recordings quickly
- Submit for review
- Get feedback and iterate if needed

**Pain Points:**

- Installing screen recording software is annoying
- Unclear task requirements
- Don't know if recording was submitted successfully
- No visibility into review status

**User Stories:**

- "I want to see all my assigned tasks in one place"
- "I need to record my screen without installing anything"
- "I want to know immediately if my recording was accepted or needs revisions"
- "I need clear instructions on what to record before I start"

---

#### **Persona 4: External Contributor (Jessica)**

**Demographics:**

- Age: 25-50
- Role: Freelancer, Contractor, External Vendor
- Relationship: No employee relationship
- Tech Savviness: Medium

**Goals:**

- Complete recording tasks sent via email/link
- Submit recordings without creating accounts
- Get confirmation of successful submission
- Potentially track multiple tasks from different clients

**Pain Points:**

- Forced to create accounts for one-off tasks
- Complex recording tools
- Unclear requirements
- No confirmation of receipt

**User Stories:**

- "I just want to click a link, record, and submit"
- "I don't want to create another account"
- "I need clear instructions on what you need me to record"
- "I want confirmation that my recording was received"

---

#### **Persona 5: Reviewer (David)**

**Demographics:**

- Age: 30-50
- Role: Senior Manager, Quality Lead, Training Manager
- Company: SMB/Mid-Market
- Tech Savviness: Medium

**Goals:**

- Review submitted recordings efficiently
- Provide structured feedback
- Approve or reject submissions
- Track review history

**Pain Points:**

- Watching long recordings without context
- Can't easily point to specific moments that need revision
- No standardized feedback process
- Difficult to track what's been reviewed

**User Stories:**

- "I need to review 20 recordings this week efficiently"
- "I want to leave time-stamped comments on recordings"
- "I need to send clear feedback so contributors know exactly what to fix"
- "I want to see my review history and metrics"

---

### 2.2 Secondary Personas

#### **Super Admin (You/Platform Owner)**

- Manages platform health, multi-tenancy, system updates
- Monitors all organizations (with permission)
- Handles escalated support issues

---

## 3. Feature Specifications

### 3.1 MVP Features (Phase 1) - Core Platform

#### **F1: Multi-Tenant Organization Management**

**Description:**
Complete organizational structure supporting multiple independent organizations with data isolation.

**Requirements:**

- **F1.1** Organization creation during signup
  - Unique organization name (slug)
  - Organization display name
  - Industry/category selection
  - Timezone configuration
  - Auto-generated organization ID (UUID)

- **F1.2** Organization settings management
  - Update organization details
  - Upload organization logo
  - Set default task settings
  - Configure storage limits
  - Set retention policies

- **F1.3** Data isolation
  - Complete database-level tenant isolation
  - Users cannot access data from other organizations
  - Cross-organization queries prevented
  - Separate storage namespacing

**Acceptance Criteria:**

- ✅ User can create organization during signup
- ✅ Organization has unique identifier and slug
- ✅ Users from Org A cannot see any data from Org B
- ✅ Organization admin can update settings
- ✅ Logo appears in UI and emails

**Priority:** P0 (Blocker)

---

#### **F2: User Authentication & Account Management**

**Description:**
Secure authentication system with email/password and social login options.

**Requirements:**

- **F2.1** User registration
  - Email + password signup
  - Email verification required
  - Password requirements (min 8 chars, 1 uppercase, 1 number, 1 special)
  - Organization creation flow for first user
  - Join existing organization flow for invited users

- **F2.2** User login
  - Email/password authentication
  - Google OAuth (optional)
  - "Remember me" functionality
  - JWT-based sessions

- **F2.3** Password management
  - Forgot password flow
  - Password reset via email
  - Password change (logged in users)
  - Password strength indicator

- **F2.4** Account settings
  - Update profile (name, email, avatar)
  - Change password
  - Two-factor authentication (2FA) - optional for MVP
  - Session management (view active sessions, logout all)

**Tech Stack:**

- Auth Provider: **Clerk** (recommended) or Custom with PostgreSQL
- Token Type: JWT
- Session Duration: 7 days (configurable)

**Acceptance Criteria:**

- ✅ User can sign up with email/password
- ✅ Email verification link works
- ✅ User can log in and receive JWT
- ✅ Password reset flow works end-to-end
- ✅ User can update profile information
- ✅ Sessions expire after 7 days

**Priority:** P0 (Blocker)

---

#### **F3: Role-Based Access Control (RBAC)**

**Description:**
Comprehensive permission system with predefined roles and granular permissions.

**Requirements:**

**Roles:**

1. **Organization Admin**
   - Full access to organization settings
   - Invite/remove users
   - Assign/change user roles
   - View billing and usage
   - Delete organization (with confirmation)
   - View all tasks, recordings, and reviews

2. **Manager**
   - Create and assign tasks
   - View tasks for their team
   - Review submitted recordings
   - Invite external contributors (magic links)
   - View team analytics
   - Cannot access billing or organization settings

3. **Member**
   - View assigned tasks
   - Complete and submit recordings
   - View own submission history
   - Cannot create tasks or review others' work

4. **Reviewer**
   - View tasks assigned for review
   - Review and approve/reject recordings
   - Provide feedback
   - Cannot create tasks or assign work

5. **Viewer** (Read-Only)
   - View tasks and recordings (with permission)
   - Cannot create, edit, or delete anything
   - Useful for stakeholders, auditors

6. **External Contributor** (Magic Link Access)
   - No account required
   - Access via unique token
   - Complete assigned task only
   - Submit recording
   - View submission confirmation
   - Cannot access organization data

**Permissions Matrix:**

| Permission       | Org Admin | Manager   | Member   | Reviewer          | Viewer | External      |
| ---------------- | --------- | --------- | -------- | ----------------- | ------ | ------------- |
| Create Task      | ✅        | ✅        | ❌       | ❌                | ❌     | ❌            |
| Assign Task      | ✅        | ✅        | ❌       | ❌                | ❌     | ❌            |
| View Own Tasks   | ✅        | ✅        | ✅       | ✅                | ✅     | ✅ (assigned) |
| View All Tasks   | ✅        | ✅ (team) | ❌       | ✅ (review queue) | ✅     | ❌            |
| Submit Recording | ✅        | ✅        | ✅       | ✅                | ❌     | ✅            |
| Review Recording | ✅        | ✅        | ❌       | ✅                | ❌     | ❌            |
| Delete Recording | ✅        | ✅ (own)  | ✅ (own) | ❌                | ❌     | ❌            |
| Invite Users     | ✅        | ❌        | ❌       | ❌                | ❌     | ❌            |
| Manage Roles     | ✅        | ❌        | ❌       | ❌                | ❌     | ❌            |
| View Billing     | ✅        | ❌        | ❌       | ❌                | ❌     | ❌            |
| View Analytics   | ✅        | ✅ (team) | ✅ (own) | ✅ (reviews)      | ✅     | ❌            |

**Implementation:**

- Database: `roles` table, `permissions` table, `role_permissions` join table
- Middleware: `@RequireRole('admin')` or `@RequirePermission('task:create')`
- Frontend: Component-level permission checks

**Acceptance Criteria:**

- ✅ Organization admin can assign roles to users
- ✅ Users can only perform actions permitted by their role
- ✅ API endpoints enforce permission checks
- ✅ Frontend hides unauthorized actions
- ✅ Attempting unauthorized action returns 403 Forbidden
- ✅ Audit log tracks role/permission changes

**Priority:** P0 (Blocker)

---

#### **F4: User & Team Management**

**Description:**
Tools for organization admins to manage users, teams, and invitations.

**Requirements:**

- **F4.1** User invitation
  - Admin sends email invitation
  - Invite includes organization name and role
  - Unique invitation link (expires in 7 days)
  - Invitee creates account and joins organization
  - Bulk invite (CSV upload)

- **F4.2** User management
  - View all organization users (table view)
  - Filter by role, status (active/inactive)
  - Search users by name/email
  - Edit user role
  - Deactivate user (soft delete, preserves data)
  - Reactivate user

- **F4.3** Team management (Optional for MVP, recommended for V1.1)
  - Create teams/departments
  - Assign users to teams
  - Set team manager
  - View team performance metrics

**Acceptance Criteria:**

- ✅ Admin can send invitation email
- ✅ Invitation link allows recipient to join organization
- ✅ Admin can view list of all users with roles
- ✅ Admin can change user's role
- ✅ Admin can deactivate user (user loses access)
- ✅ Deactivated user's data is preserved
- ✅ Bulk invite via CSV works for 10+ users

**Priority:** P0 (Blocker)

---

#### **F5: Task Management**

**Description:**
Core workflow: creating, assigning, tracking, and completing screen recording tasks.

**Requirements:**

- **F5.1** Task creation
  - Task title (required)
  - Task description (Markdown supported)
  - Task type: Screen Recording, Screen + Audio, Camera + Screen
  - Assignment method:
    - Assign to internal user (select from list)
    - Generate magic link for external contributor
  - Reviewer assignment (select user with Reviewer or Manager role)
  - Priority: Low, Medium, High, Urgent
  - Due date (optional)
  - Estimated duration (optional, helps contributor plan)
  - Tags/labels (optional)

- **F5.2** Task assignment
  - Assign to specific user by email
  - Generate magic link for external contributor
  - Send notification email
  - Track assignment status (invited, viewed, in-progress, completed)

- **F5.3** Task dashboard
  - **All Tasks View** (Admin/Manager)
    - Filter: All, Assigned, In Progress, Submitted, Under Review, Completed, Rejected
    - Sort: Created date, due date, priority
    - Search by title, assignee
  - **My Tasks View** (Member)
    - Shows only tasks assigned to logged-in user
    - Filter: Not Started, In Progress, Submitted, Needs Revision
  - **Review Queue** (Reviewer)
    - Shows tasks pending review
    - Sort by submission date, priority

- **F5.4** Task statuses
  - `draft` - Created but not assigned
  - `assigned` - Assigned to user or magic link generated
  - `in_progress` - Contributor has started recording
  - `submitted` - Recording uploaded, awaiting review
  - `under_review` - Reviewer is reviewing
  - `approved` - Accepted by reviewer
  - `rejected` - Needs revision
  - `completed` - Final approved state
  - `archived` - Soft deleted

- **F5.5** Task details view
  - View all task information
  - View assignee info
  - View recording (if submitted)
  - View review comments and history
  - Edit task (if not yet submitted)
  - Delete task (admin only)
  - Reassign task

**Acceptance Criteria:**

- ✅ Manager can create task with all required fields
- ✅ Task can be assigned to internal user
- ✅ Task can generate magic link for external contributor
- ✅ Assignee receives email notification
- ✅ Member sees assigned tasks in dashboard
- ✅ Task status updates correctly throughout lifecycle
- ✅ Reviewer sees submitted tasks in review queue
- ✅ Admin can view all tasks across organization

**Priority:** P0 (Blocker)

---

#### **F6: Screen Recording Capture**

**Description:**
Browser-based screen recording with audio support, no software installation required.

**Requirements:**

- **F6.1** Recording interface
  - Access via task link (authenticated users) or magic link (external)
  - Screen selection: Full screen, application window, browser tab
  - Audio options: No audio, System audio, Microphone, Both
  - Resolution: 1080p (default), 720p, 4K (future)
  - Frame rate: 30 fps (default), 60 fps (future)

- **F6.2** Recording controls
  - Start recording button (with 3-2-1 countdown)
  - Pause/Resume (optional for MVP)
  - Stop recording
  - Preview recording before submit
  - Re-record if not satisfied
  - Display recording duration

- **F6.3** Video optimization
  - Codec: VP9 (primary), VP8 (fallback)
  - Video bitrate: 1.2 Mbps (optimized for screen content)
  - Audio bitrate: 128 kbps
  - Format: WebM
  - Estimated file size display

- **F6.4** Upload process
  - Progress bar with percentage
  - Upload to Cloudflare R2
  - Retry on failure
  - Success confirmation

**Technical Implementation:**

- MediaRecorder API (browser native)
- No plugins required
- Works in Chrome 29+, Firefox 28+, Edge 14+, Safari 14.1+

**Acceptance Criteria:**

- ✅ User can initiate recording from task page
- ✅ User can select screen/window to record
- ✅ Recording captures screen at 1080p, 30fps
- ✅ Recording includes audio if selected
- ✅ User can preview recording before submitting
- ✅ User can re-record if not satisfied
- ✅ Video uploads to R2 with progress indicator
- ✅ Upload succeeds for 30-minute recording
- ✅ Success confirmation shows after upload

**Priority:** P0 (Blocker)

---

#### **F7: Recording Review & Feedback**

**Description:**
Structured review process for submitted recordings with feedback mechanisms.

**Requirements:**

- **F7.1** Review interface
  - Video player with standard controls (play, pause, seek, volume, fullscreen)
  - Playback speed control (0.5x, 1x, 1.5x, 2x)
  - Task requirements visible alongside video
  - Feedback form

- **F7.2** Feedback options
  - **Approve:** Accept recording, mark task as completed
  - **Request Revisions:** Reject with feedback, send back to contributor
  - Feedback text field (Markdown supported)
  - Time-stamped comments (optional for MVP, recommended for V1.1)
  - Attachment support (optional)

- **F7.3** Review workflow
  - Reviewer receives email notification when recording submitted
  - Reviewer accesses review queue
  - Watches recording
  - Leaves feedback
  - Approves or rejects
  - System sends notification to contributor

- **F7.4** Re-submission workflow (if rejected)
  - Contributor receives rejection email with feedback
  - Contributor can view feedback in task page
  - Contributor records new version
  - Submits for re-review
  - Maintains version history (all recordings kept)

**Acceptance Criteria:**

- ✅ Reviewer can play submitted recording
- ✅ Reviewer can approve recording (task status → completed)
- ✅ Reviewer can reject with written feedback
- ✅ Contributor receives email when recording approved/rejected
- ✅ If rejected, contributor can re-submit
- ✅ Version history shows all submissions
- ✅ Playback speed control works

**Priority:** P0 (Blocker)

---

#### **F8: Magic Link System (External Contributors)**

**Description:**
Frictionless external contribution without requiring account creation.

**Requirements:**

- **F8.1** Magic link generation
  - Generated when task assigned to external contributor
  - Includes unique token (UUID)
  - Single-use or multi-use (configurable)
  - Expiration: 30 days (configurable)
  - Link format: `https://revui.app/c/{token}`

- **F8.2** Magic link access
  - External contributor clicks link
  - Prompted to enter name and email (for identification only)
  - No account creation required
  - Access to task details and recording interface only

- **F8.3** Submission flow
  - Contributor records video
  - Submits recording
  - Sees success confirmation
  - Receives confirmation email
  - Link remains active for potential re-submission (if rejected)

- **F8.4** Security
  - Token is cryptographically secure (UUID v4)
  - Rate limiting on magic link endpoints
  - IP address logging (optional)
  - Cannot access other organization data
  - Cannot enumerate other tasks

**Acceptance Criteria:**

- ✅ Manager can generate magic link when creating task
- ✅ Link is sent via email to external contributor
- ✅ Contributor can access task via link without login
- ✅ Contributor can record and submit via magic link
- ✅ Magic link expires after 30 days
- ✅ Contributor cannot access other organization data
- ✅ Confirmation email sent after submission

**Priority:** P0 (Blocker)

---

#### **F9: Billing & Subscription Management**

**Description:**
Stripe-powered subscription management with tiered pricing.

**Requirements:**

- **F9.1** Pricing tiers

**Free Tier:**

- 1 organization
- 3 users
- 10 GB storage
- 50 recordings/month
- Basic support (email)
- Revui branding

**Starter ($29/month):**

- 1 organization
- 10 users
- 100 GB storage
- Unlimited recordings
- Email support
- Remove Revui branding

**Professional ($99/month):**

- 1 organization
- 50 users
- 500 GB storage
- Unlimited recordings
- Priority support
- Advanced analytics
- API access
- Custom branding

**Enterprise (Custom):**

- Multiple organizations (via subdomains/white-label)
- Unlimited users
- Unlimited storage
- Dedicated support
- SSO/SAML
- SLA guarantee
- On-premise deployment option

- **F9.2** Subscription management
  - Organization admin can view current plan
  - Upgrade/downgrade plans
  - View billing history
  - Update payment method
  - Cancel subscription (retains data for 30 days)

- **F9.3** Usage tracking
  - Real-time usage display (users, storage, recordings)
  - Alert when approaching limits (80%, 90%, 100%)
  - Enforce limits:
    - Block recording uploads when storage full
    - Block user invites when user limit reached
    - Show upgrade prompt

- **F9.4** Payment processing
  - Stripe Checkout integration
  - Credit card payments
  - Automatic monthly billing
  - Prorated upgrades/downgrades
  - Invoice generation (PDF)
  - Receipts sent via email

**Acceptance Criteria:**

- ✅ Organization starts on Free tier by default
- ✅ Admin can view current plan and usage
- ✅ Admin can upgrade to paid plan via Stripe Checkout
- ✅ Payment succeeds and plan updates immediately
- ✅ Usage tracking shows accurate numbers
- ✅ System blocks actions when limits exceeded
- ✅ Admin can cancel subscription
- ✅ Data retained for 30 days after cancellation

**Priority:** P1 (Important)

---

#### **F10: Notifications & Emails**

**Description:**
Automated notification system to keep users informed of important events.

**Requirements:**

- **F10.1** Email notifications

**Trigger Events:**

- User invited to organization → Invitation email
- Task assigned → Assignment email (with magic link if external)
- Recording submitted → Notification to reviewer
- Recording approved → Notification to contributor
- Recording rejected → Notification to contributor with feedback
- Comment added to recording → Notification to contributor/reviewer
- Task due soon (24 hours) → Reminder email
- Subscription expiring → Renewal reminder (7 days, 3 days, 1 day)
- Usage limit approaching → Warning email (80%, 95%, 100%)

- **F10.2** In-app notifications
  - Notification bell icon in header
  - Badge count for unread notifications
  - Notification list with timestamps
  - Mark as read
  - Click to navigate to relevant page

- **F10.3** Notification preferences
  - User can customize email preferences
  - Toggle individual notification types
  - Digest mode (daily summary instead of real-time)
  - Do Not Disturb hours

**Email Provider:**

- Brevo (formerly Sendinblue) - Free tier: 300 emails/day

**Acceptance Criteria:**

- ✅ User receives email when invited to organization
- ✅ Assignee receives email when task assigned
- ✅ Reviewer receives email when recording submitted
- ✅ Contributor receives email when recording reviewed
- ✅ Notification appears in-app (bell icon)
- ✅ User can mark notification as read
- ✅ User can customize email preferences

**Priority:** P1 (Important)

---

### 3.2 V1.1 Features (Post-MVP)

#### **F11: Analytics & Reporting**

- Organization-wide analytics dashboard
- Metrics: Tasks created, completed, avg turnaround time, user activity
- Team performance reports
- Export reports (CSV, PDF)

#### **F12: Time-Stamped Comments**

- Reviewers can add comments at specific video timestamps
- Comments appear as markers on video timeline
- Click marker to jump to that moment

#### **F13: Team Management**

- Create teams/departments within organization
- Assign users to teams
- Team-specific dashboards and analytics
- Team-based permissions (optional)

#### **F14: API Access**

- RESTful API for Professional+ plans
- Create tasks programmatically
- Retrieve recordings
- Webhook support for events
- API key management

#### **F15: Integrations**

- Slack: Notifications, task creation from Slack
- Zapier: Connect to 5000+ apps
- Google Drive: Export recordings
- Notion: Link tasks to Notion docs

---

### 3.3 V2.0 Features (Future)

#### **F16: Advanced Security**

- Single Sign-On (SSO/SAML)
- Two-Factor Authentication (2FA) enforced
- IP whitelist
- Audit logs (compliance)

#### **F17: White-Labeling**

- Custom domain (app.yourcompany.com)
- Custom branding (colors, logo)
- Remove Revui branding entirely

#### **F18: Advanced Recording Features**

- AI-generated transcripts
- Automated highlights/chapters
- Real-time collaboration (multiple reviewers)
- Drawing/annotation tools during review

#### **F19: Mobile App**

- iOS and Android apps
- Mobile recording support
- Push notifications

---

## 4. User Stories & Acceptance Criteria

### Epic 1: Organization Setup

**US-1.1: As an organization administrator, I want to create my organization so that I can start inviting my team.**

**Acceptance Criteria:**

- Given I'm a new user signing up
- When I complete the registration form
- Then I'm prompted to create an organization with name and industry
- And my account is automatically set as Organization Admin role
- And I'm redirected to the organization dashboard

---

**US-1.2: As an organization administrator, I want to invite team members so that they can start using the platform.**

**Acceptance Criteria:**

- Given I'm logged in as an admin
- When I navigate to Team → Invite Users
- And I enter email addresses and select roles
- Then invitation emails are sent
- And invited users appear in "Pending Invitations" list
- When invitee clicks link and signs up
- Then they automatically join my organization with assigned role

---

### Epic 2: Task Management

**US-2.1: As a manager, I want to create a screen recording task so that my team member knows what to record.**

**Acceptance Criteria:**

- Given I'm logged in as Manager or Admin
- When I navigate to Tasks → Create Task
- And I fill in title, description, assignee, and due date
- And I click "Create & Assign"
- Then the task is created
- And the assignee receives an email notification
- And I see the task in my Tasks dashboard with status "Assigned"

---

**US-2.2: As a team member, I want to see my assigned tasks so that I know what recordings I need to complete.**

**Acceptance Criteria:**

- Given I'm logged in as Member
- When I navigate to My Tasks
- Then I see all tasks assigned to me
- And tasks are grouped by status (Not Started, In Progress, Submitted)
- And I can click a task to view details

---

**US-2.3: As a manager, I want to generate a magic link for external contributors so that they can submit recordings without creating accounts.**

**Acceptance Criteria:**

- Given I'm creating a new task
- When I select "External Contributor" as assignment type
- And I enter contributor's email
- Then a magic link is generated
- And an email is sent to the contributor with the link
- And the task status is "Assigned"
- When contributor clicks link
- Then they can access task details and recording interface without login

---

### Epic 3: Recording Submission

**US-3.1: As a team member, I want to record my screen directly in the browser so that I don't need to install software.**

**Acceptance Criteria:**

- Given I have a task assigned to me
- When I click "Start Recording"
- Then I'm prompted to select screen/window
- And I can choose to include audio
- When I click "Record"
- Then a 3-2-1 countdown starts
- And recording begins
- And I see recording duration timer
- When I click "Stop"
- Then recording stops
- And I can preview the video

---

**US-3.2: As a team member, I want to preview my recording before submitting so that I can re-record if I made a mistake.**

**Acceptance Criteria:**

- Given I've stopped recording
- When the preview screen appears
- Then I can play the video
- And I see "Submit" and "Re-record" buttons
- When I click "Re-record"
- Then I can start a new recording
- When I click "Submit"
- Then the video uploads with a progress bar
- And I see success confirmation when complete

---

### Epic 4: Review Process

**US-4.1: As a reviewer, I want to see all recordings pending my review so that I can prioritize my work.**

**Acceptance Criteria:**

- Given I'm logged in as Reviewer or Manager
- When I navigate to Review Queue
- Then I see all tasks with status "Submitted" that are assigned to me for review
- And tasks are sorted by submission date (oldest first)
- And I see task title, contributor, submission date, and priority

---

**US-4.2: As a reviewer, I want to watch submitted recordings and provide feedback so that contributors know if their work is approved.**

**Acceptance Criteria:**

- Given I have a recording to review
- When I click on the task
- Then I see the video player with the recording
- And I can play, pause, seek, and adjust speed
- And I see the original task requirements
- When I write feedback and click "Approve"
- Then the task status changes to "Approved"
- And the contributor receives an email notification
- When I write feedback and click "Request Revisions"
- Then the task status changes to "Rejected"
- And the contributor receives an email with feedback

---

### Epic 5: Billing

**US-5.1: As an organization admin, I want to upgrade my plan so that I can add more users and storage.**

**Acceptance Criteria:**

- Given I'm on the Free plan
- When I navigate to Settings → Billing
- And I click "Upgrade" on a paid plan
- Then I'm redirected to Stripe Checkout
- When I complete payment
- Then I'm redirected back to the app
- And my plan is updated immediately
- And I see increased limits

---

**US-5.2: As an organization admin, I want to see my current usage so that I know if I'm approaching my plan limits.**

**Acceptance Criteria:**

- Given I'm logged in as admin
- When I navigate to Settings → Billing
- Then I see my current plan name
- And I see usage bars for: Users (X/Y), Storage (X GB / Y GB), Recordings (X/Y this month)
- And usage bars are color-coded: Green (<80%), Yellow (80-95%), Red (>95%)

---

## 5. Non-Functional Requirements

### 5.1 Performance

- **Page Load:** All pages must load in <2 seconds (p95) on 3G connection
- **API Response Time:** All API endpoints must respond in <500ms (p95)
- **Video Upload:** Support uploads up to 2GB without failure
- **Video Playback:** Video must start playing within 3 seconds of clicking play
- **Concurrent Users:** Support 1000 concurrent users per organization

### 5.2 Security

- **Authentication:** JWT tokens with HMAC-SHA256 signing
- **Password Storage:** Bcrypt with salt rounds ≥12
- **HTTPS:** All traffic encrypted with TLS 1.3
- **Data Isolation:** Complete database-level tenant isolation
- **Input Validation:** All user inputs sanitized to prevent XSS, SQL injection
- **Rate Limiting:** API endpoints rate-limited (100 requests/minute per user)
- **Magic Links:** Cryptographically secure tokens (UUID v4), single-use or time-limited

### 5.3 Reliability

- **Uptime:** 99.9% uptime SLA (8.76 hours downtime/year max)
- **Data Backup:** Daily automated backups, retained for 30 days
- **Disaster Recovery:** Recovery Time Objective (RTO) <4 hours, Recovery Point Objective (RPO) <1 hour
- **Error Handling:** All errors logged to Sentry, graceful degradation

### 5.4 Scalability

- **Horizontal Scaling:** Backend must be stateless to support load balancing
- **Database:** PostgreSQL with connection pooling, read replicas for scaling
- **Storage:** Cloudflare R2 for infinite scalability
- **CDN:** Video delivery via Cloudflare CDN for global performance

### 5.5 Accessibility

- **WCAG 2.1 Level AA** compliance
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Minimum font size: 14px (or user-scalable)

### 5.6 Browser Support

- **Desktop:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Mobile:** Chrome Mobile 90+, Safari iOS 14+
- **Screen Recording:** Chrome 29+, Firefox 28+, Edge 14+, Safari 14.1+

### 5.7 Compliance (Future)

- **GDPR:** Right to be forgotten, data portability, consent management
- **SOC 2 Type II:** Planned for Enterprise tier
- **Data Residency:** Multi-region support (US, EU) for Enterprise

---

## 6. Technical Constraints

### 6.1 Infrastructure

- **Frontend Hosting:** Vercel (Next.js/React)
- **Backend Hosting:** Coolify on self-hosted server
- **Database:** PostgreSQL (self-hosted or managed)
- **Storage:** Cloudflare R2
- **CDN:** Cloudflare
- **Email:** Brevo (300 emails/day free)
- **Payments:** Stripe

### 6.2 Technology Stack

**Frontend:**

- React 18+ with TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- React Query (data fetching)
- Zustand or Jotai (state management)

**Backend:**

- NestJS with TypeScript
- PostgreSQL 16
- Drizzle ORM or Prisma
- Cloudflare R2 SDK
- Bull (job queue for video processing)

**Authentication:**

- Clerk (recommended) or custom JWT with PostgreSQL

**Monitoring:**

- Sentry (error tracking)
- PostHog (analytics)
- Uptime monitoring

---

## 7. Success Criteria

### 7.1 Launch Success (First 90 Days)

- **Acquisition:**
  - 50 organizations signed up
  - 200 total users
  - 10 paying customers (Starter or Professional)

- **Engagement:**
  - 500 recordings uploaded
  - Average 10 recordings per organization
  - 70% task completion rate
  - <24 hour average review turnaround time

- **Retention:**
  - 80% month-1 retention
  - 60% month-3 retention
  - <5% churn for paying customers

### 7.2 Product Quality

- 99.5% uptime
- <1% video upload failure rate
- <10 critical bugs reported
- NPS score >40

### 7.3 Business Metrics

- MRR: $1,000 by month 3
- CAC <$500 (target)
- LTV:CAC ratio >3:1
- Average contract value: $50/month

---

## 8. Risks & Mitigations

### Risk 1: Low Adoption of Magic Links

**Mitigation:** A/B test with and without account requirement, analyze conversion rates

### Risk 2: Video Upload Failures

**Mitigation:** Implement chunked uploads, retry logic, pre-upload bandwidth testing

### Risk 3: Storage Costs Exceed Projections

**Mitigation:** Aggressive video compression, retention policies, tiered storage

### Risk 4: Competitor Launches Similar Product

**Mitigation:** Focus on UX simplicity and external contributor workflow (differentiation)

### Risk 5: Churn Due to Complexity

**Mitigation:** Invest heavily in onboarding, tutorials, in-app guidance

---

## 9. Roadmap

### Phase 1: MVP Development (Months 1-3)

- Multi-tenant architecture
- Authentication & RBAC
- Task management
- Screen recording
- Review workflow
- Magic links
- Basic billing (Free + Starter tiers)

### Phase 2: V1.1 - Enhanced Features (Months 4-5)

- Analytics dashboard
- Time-stamped comments
- Team management
- API access (beta)

### Phase 3: V1.5 - Integrations (Months 6-7)

- Slack integration
- Zapier integration
- Webhooks

### Phase 4: V2.0 - Enterprise (Months 8-10)

- SSO/SAML
- White-labeling
- Advanced security features
- Multi-region support

### Phase 5: V3.0 - Advanced Features (Months 11-12)

- AI transcription
- Mobile apps
- Real-time collaboration

---

## 10. Appendix

### 10.1 Glossary

- **Organization:** A company/entity using the platform (tenant)
- **Magic Link:** Secure token-based URL allowing external contributor access without login
- **Contributor:** Person submitting a recording (internal or external)
- **Reviewer:** Person reviewing and approving/rejecting recordings
- **Task:** A screen recording assignment
- **Recording:** A screen video submission
- **RBAC:** Role-Based Access Control
- **Tenant:** Same as Organization in multi-tenant context

### 10.2 References

- [Clerk Documentation](https://clerk.dev/docs)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Stripe Billing Documentation](https://stripe.com/docs/billing)

---

**Document Prepared By:** AI Assistant
**Stakeholders:** Paul Stevens (Product Owner)
**Next Steps:** Review and approve PRD → Create Technical Architecture Document → Begin development

---

_This is a living document and will be updated as product evolves._
