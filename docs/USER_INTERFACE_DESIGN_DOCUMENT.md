# User Interface Design Document (UIDD)
# Revui - Multi-Tenant Screen Recording SaaS Platform

**Document Version:** 1.0
**Last Updated:** January 2025
**Status:** Draft - Greenfield Design
**Design System:** Tailwind CSS + shadcn/ui

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Design System](#2-design-system)
3. [Information Architecture](#3-information-architecture)
4. [User Flows](#4-user-flows)
5. [Page Layouts & Wireframes](#5-page-layouts--wireframes)
6. [Component Specifications](#6-component-specifications)
7. [Responsive Design](#7-responsive-design)
8. [Accessibility](#8-accessibility)
9. [Interaction Patterns](#9-interaction-patterns)
10. [Error States & Messaging](#10-error-states--messaging)

---

## 1. Design Principles

### 1.1 Core Design Values

**1. Clarity Over Complexity**
- Every interface element should have a clear purpose
- Remove unnecessary features and options
- Use progressive disclosure (show advanced options only when needed)

**2. Speed & Efficiency**
- Minimize clicks to complete tasks
- Keyboard shortcuts for power users
- Fast page loads (<2 seconds)
- Optimistic UI updates

**3. Consistency**
- Reusable components across all pages
- Consistent terminology (e.g., always "Recording" not sometimes "Video")
- Predictable navigation structure

**4. Feedback & Confirmation**
- Every action provides immediate visual feedback
- Success/error messages are clear and actionable
- Loading states show progress

**5. Professional & Trustworthy**
- Clean, modern design
- Credible color palette (blues, grays, accent colors)
- High-quality visuals
- Error-free experience

### 1.2 Target User Experience Goals

**For Organization Admins:**
- Set up organization in <5 minutes
- Invite entire team in <2 minutes
- Understand usage at a glance

**For Managers:**
- Create and assign task in <1 minute
- Review recording in <3 minutes
- Track team progress easily

**For Members:**
- Start recording in <30 seconds
- Submit recording in <1 minute
- Understand feedback immediately

**For External Contributors:**
- Access task without friction (no signup)
- Record and submit in <2 minutes
- Receive confirmation instantly

---

## 2. Design System

### 2.1 Color Palette

**Primary Colors (Brand):**
```
Primary Blue:   #3B82F6 (rgb(59, 130, 246))  - Main CTA buttons, links
Primary Hover:  #2563EB (rgb(37, 99, 235))   - Hover state
Primary Dark:   #1E40AF (rgb(30, 64, 175))   - Active state
```

**Secondary Colors:**
```
Success Green:  #10B981 (rgb(16, 185, 129))  - Approvals, success states
Warning Yellow: #F59E0B (rgb(245, 158, 11))  - Warnings, pending actions
Error Red:      #EF4444 (rgb(239, 68, 68))   - Errors, rejections
Info Blue:      #3B82F6 (rgb(59, 130, 246))  - Informational messages
```

**Neutral Colors (UI):**
```
Gray 50:   #F9FAFB  - Backgrounds
Gray 100:  #F3F4F6  - Subtle backgrounds
Gray 200:  #E5E7EB  - Borders, dividers
Gray 300:  #D1D5DB  - Disabled states
Gray 400:  #9CA3AF  - Placeholder text
Gray 500:  #6B7280  - Secondary text
Gray 600:  #4B5563  - Body text
Gray 700:  #374151  - Headings
Gray 800:  #1F2937  - Dark text
Gray 900:  #111827  - Darkest text
```

**Usage:**
- Primary Blue: CTAs, important actions, links
- Success Green: Task completed, recording approved
- Warning Yellow: Approaching limits, task due soon
- Error Red: Failed actions, rejected recordings
- Gray scale: Text, backgrounds, borders

### 2.2 Typography

**Font Family:**
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

**Type Scale:**
```
Display Large:  48px / 56px line-height, font-weight: 700 (headings)
Display:        36px / 44px line-height, font-weight: 700
Heading 1:      30px / 36px line-height, font-weight: 600
Heading 2:      24px / 32px line-height, font-weight: 600
Heading 3:      20px / 28px line-height, font-weight: 600
Heading 4:      18px / 28px line-height, font-weight: 600
Body Large:     16px / 24px line-height, font-weight: 400 (default)
Body:           14px / 20px line-height, font-weight: 400
Body Small:     12px / 16px line-height, font-weight: 400 (captions, labels)
```

**Usage Examples:**
- Page titles: Heading 1 (30px, semi-bold)
- Section titles: Heading 2 (24px, semi-bold)
- Card titles: Heading 3 (20px, semi-bold)
- Body text: Body (14px, regular)
- Labels: Body Small (12px, regular, uppercase)

### 2.3 Spacing System

**Base Unit:** 4px (0.25rem)

```
Space 0:    0px
Space 1:    4px   (0.25rem)
Space 2:    8px   (0.5rem)
Space 3:    12px  (0.75rem)
Space 4:    16px  (1rem)     - Standard padding
Space 5:    20px  (1.25rem)
Space 6:    24px  (1.5rem)   - Section spacing
Space 8:    32px  (2rem)     - Large section spacing
Space 10:   40px  (2.5rem)
Space 12:   48px  (3rem)
Space 16:   64px  (4rem)     - Page margins
```

**Usage:**
- Component padding: 16px (Space 4)
- Section gaps: 24px (Space 6)
- Page margins: 32-64px (Space 8-16)

### 2.4 Border Radius

```
Radius None:    0px
Radius SM:      4px   - Inputs, small buttons
Radius MD:      8px   - Cards, buttons (default)
Radius LG:      12px  - Large cards, modals
Radius XL:      16px  - Featured elements
Radius Full:    9999px - Pills, avatars
```

### 2.5 Shadows

```
Shadow SM:   0 1px 2px 0 rgba(0, 0, 0, 0.05)              - Subtle elevation
Shadow MD:   0 4px 6px -1px rgba(0, 0, 0, 0.1)            - Cards (default)
Shadow LG:   0 10px 15px -3px rgba(0, 0, 0, 0.1)          - Modals, dropdowns
Shadow XL:   0 20px 25px -5px rgba(0, 0, 0, 0.1)          - Hero elements
```

### 2.6 Iconography

**Icon Library:** Lucide React (https://lucide.dev/)

**Icon Sizes:**
```
Icon SM:  16px  - Inline with text
Icon MD:  20px  - Buttons
Icon LG:  24px  - Page headers
Icon XL:  32px  - Empty states, illustrations
```

**Common Icons:**
- Tasks: `CheckSquare`
- Recordings: `Video`
- Users: `Users`
- Settings: `Settings`
- Logout: `LogOut`
- Add: `Plus`
- Edit: `Edit`
- Delete: `Trash2`
- Download: `Download`
- Upload: `Upload`
- Search: `Search`
- Filter: `Filter`
- Menu: `Menu`

---

## 3. Information Architecture

### 3.1 Application Structure

```
Revui Application
│
├── Public (Unauthenticated)
│   ├── Landing Page (/)
│   ├── Login (/login)
│   ├── Register (/register)
│   ├── Forgot Password (/forgot-password)
│   ├── Reset Password (/reset-password/:token)
│   └── Magic Link Task (/c/:token)  [External contributors]
│
└── Application (Authenticated)
    │
    ├── Dashboard (/dashboard)
    │   └── Overview cards, recent activity, quick actions
    │
    ├── Tasks (/tasks)
    │   ├── All Tasks (/tasks)
    │   ├── My Tasks (/tasks/my-tasks)
    │   ├── Review Queue (/tasks/review-queue)
    │   ├── Create Task (/tasks/create)
    │   └── Task Detail (/tasks/:id)
    │       ├── Task Info
    │       ├── Record Screen (if assignee)
    │       └── Review Recording (if reviewer)
    │
    ├── Recordings (/recordings)
    │   ├── All Recordings (/recordings)
    │   ├── Recording Detail (/recordings/:id)
    │   └── Recording Playback & Review
    │
    ├── Team (/team) [Admin/Manager only]
    │   ├── Users List (/team/users)
    │   ├── Invite Users (/team/invite)
    │   └── User Detail (/team/users/:id)
    │
    ├── Settings (/settings)
    │   ├── Profile (/settings/profile)
    │   ├── Organization (/settings/organization) [Admin only]
    │   ├── Billing (/settings/billing) [Admin only]
    │   ├── Notifications (/settings/notifications)
    │   └── Security (/settings/security)
    │
    └── Help & Support
        ├── Documentation
        ├── Support Ticket
        └── Video Tutorials
```

### 3.2 Navigation Hierarchy

**Primary Navigation (Sidebar):**
1. Dashboard - Home icon
2. Tasks - CheckSquare icon
3. Recordings - Video icon
4. Team - Users icon (Admin/Manager only)
5. Settings - Settings icon

**User Menu (Top Right):**
- Profile
- Settings
- Billing (Admin only)
- Help & Docs
- Logout

**Context-Specific Actions:**
- Create Task (Tasks page)
- Invite User (Team page)
- Upload Recording (Task detail)
- Review Recording (Task detail for reviewers)

---

## 4. User Flows

### 4.1 New User Onboarding Flow

```
┌──────────────────────────────────────────────────────────┐
│  Step 1: Landing Page                                     │
│  - Value proposition                                      │
│  - CTA: "Get Started Free"                                │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│  Step 2: Registration Form                                │
│  - Full Name                                              │
│  - Email                                                  │
│  - Password                                               │
│  - Agree to Terms                                         │
│  - CTA: "Create Account"                                  │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│  Step 3: Email Verification                               │
│  - "Check your email"                                     │
│  - Instruction to click verification link                 │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│  Step 4: Create Organization                              │
│  - Organization Name                                      │
│  - Industry (dropdown)                                    │
│  - Team Size (optional)                                   │
│  - CTA: "Create Organization"                             │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│  Step 5: Welcome Dashboard                                │
│  - Welcome message                                        │
│  - Quick start checklist:                                 │
│    □ Invite team members                                  │
│    □ Create your first task                               │
│    □ Record a demo                                        │
│  - CTA buttons for each action                            │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Task Creation & Assignment Flow

```
Manager
   │
   ├─> 1. Navigate to Tasks → "Create Task" button
   │
   ├─> 2. Fill Task Form:
   │      - Title (required)
   │      - Description (Markdown editor)
   │      - Assignment Type:
   │        ○ Internal User (dropdown list)
   │        ○ External Contributor (email input)
   │      - Reviewer (dropdown)
   │      - Priority (Low/Medium/High/Urgent)
   │      - Due Date (optional)
   │      - Estimated Duration (optional)
   │
   ├─> 3. Click "Create & Assign"
   │
   ├─> 4. Confirmation:
   │      - Success message
   │      - Email sent to assignee
   │      - Redirect to task detail page
   │
   └─> 5. Track Progress:
          - Task appears in "All Tasks"
          - Status updates automatically
```

### 4.3 Recording Submission Flow (Internal User)

```
Member
   │
   ├─> 1. Navigate to "My Tasks"
   │
   ├─> 2. Click on assigned task
   │
   ├─> 3. Click "Start Recording" button
   │
   ├─> 4. Recording Setup:
   │      - Select screen/window
   │      - Toggle audio options
   │      - Preview camera (if enabled)
   │
   ├─> 5. Click "Record" → 3-2-1 countdown
   │
   ├─> 6. Recording in progress:
   │      - Timer showing duration
   │      - Stop button (red circle)
   │      - Pause button (optional)
   │
   ├─> 7. Click "Stop Recording"
   │
   ├─> 8. Preview Screen:
   │      - Video player with recording
   │      - Buttons: "Re-record" | "Submit Recording"
   │
   ├─> 9. Click "Submit Recording"
   │
   ├─> 10. Upload Progress:
   │       - Progress bar with percentage
   │       - File size / Total size
   │       - Estimated time remaining
   │
   └─> 11. Success Confirmation:
           - "Recording submitted successfully!"
           - Task status → "Submitted"
           - Notification sent to reviewer
```

### 4.4 External Contributor Flow (Magic Link)

```
External Contributor
   │
   ├─> 1. Receive email with magic link
   │
   ├─> 2. Click link → Opens in browser
   │
   ├─> 3. Landing Screen:
   │      - Task title and description
   │      - Requester name
   │      - Expected deliverable
   │      - Input fields (optional):
   │        - Your Name
   │        - Your Email (pre-filled if sent)
   │
   ├─> 4. Click "Start Recording"
   │      [Same recording flow as internal user]
   │
   └─> 5. Success Screen:
           - "Thank you! Your recording has been submitted."
           - Confirmation email sent
           - Instructions to close browser
```

### 4.5 Review & Approval Flow

```
Reviewer
   │
   ├─> 1. Receive email: "New recording to review"
   │
   ├─> 2. Click link or navigate to Review Queue
   │
   ├─> 3. Review Queue:
   │      - List of pending recordings
   │      - Sort by: submission date, priority
   │
   ├─> 4. Click on task to review
   │
   ├─> 5. Review Screen:
   │      - Left panel: Task requirements
   │      - Center: Video player
   │        - Play/pause controls
   │        - Seek bar
   │        - Speed control (0.5x, 1x, 1.5x, 2x)
   │        - Fullscreen
   │      - Right panel: Feedback form
   │
   ├─> 6. Watch recording
   │
   ├─> 7. Decision:
   │      Option A: Approve
   │        - Write feedback (optional)
   │        - Click "Approve Recording"
   │        - Task status → "Approved"
   │        - Contributor notified
   │
   │      Option B: Request Revisions
   │        - Write feedback (required)
   │        - Click "Request Revisions"
   │        - Task status → "Needs Revision"
   │        - Contributor notified with feedback
   │
   └─> 8. Confirmation & Next:
           - Success message
           - Option to review next recording
           - Return to Review Queue
```

---

## 5. Page Layouts & Wireframes

### 5.1 Application Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR (Fixed, 64px height)                               │
│  ┌───────────────────┐                   ┌────────────────┐ │
│  │ Logo + Org Name   │                   │ User Menu ▼    │ │
│  └───────────────────┘                   └────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│              │                                               │
│  SIDEBAR     │        MAIN CONTENT AREA                      │
│  (240px)     │                                               │
│              │                                               │
│  Dashboard   │   ┌────────────────────────────────────┐    │
│  Tasks       │   │                                     │    │
│  Recordings  │   │  Page Title                         │    │
│  Team        │   │  Breadcrumb                         │    │
│  Settings    │   │                                     │    │
│              │   │  Action Buttons                     │    │
│              │   └────────────────────────────────────┘    │
│              │                                               │
│              │   ┌────────────────────────────────────┐    │
│              │   │                                     │    │
│              │   │  Page Content                       │    │
│              │   │  (Tables, Cards, Forms, etc.)       │    │
│              │   │                                     │    │
│              │   │                                     │    │
│              │   │                                     │    │
│              │   └────────────────────────────────────┘    │
│              │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

### 5.2 Dashboard Page

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                                   │
│  Home / Dashboard                                            │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  All Tasks   │ │ Pending      │ │  Completed   │       │
│  │     42       │ │ Reviews      │ │   Today      │       │
│  │              │ │     8        │ │     12       │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Recent Tasks                           View All →    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  ○ Product Demo Recording               Assigned     │  │
│  │    Due: Jan 20, 2025 • Assigned to: Sarah            │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  ○ Bug Reproduction Video               Submitted    │  │
│  │    Due: Jan 18, 2025 • Waiting for review            │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  ✓ Onboarding Tutorial                  Completed    │  │
│  │    Completed: Jan 15, 2025 • Approved                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────┐ ┌──────────────────────────────┐  │
│  │  Quick Actions      │ │  Team Activity               │  │
│  ├─────────────────────┤ ├──────────────────────────────┤  │
│  │  + Create Task      │ │  • Sarah completed task      │  │
│  │  + Invite User      │ │  • Marcus reviewed recording │  │
│  │  📊 View Analytics   │ │  • Alex submitted recording  │  │
│  └─────────────────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Tasks List Page

```
┌─────────────────────────────────────────────────────────────┐
│  Tasks                                    [+ Create Task]    │
│  Home / Tasks                                                │
│                                                              │
│  Tabs: [ All Tasks ] [ My Tasks ] [ Review Queue ]          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Filters:                                               │ │
│  │  Status: [All ▼]  Priority: [All ▼]  Assignee: [All ▼] │ │
│  │  Search: [🔍 Search tasks...]                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Title                  Status      Assignee   Due Date │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  🔴 Product Demo        Assigned    Sarah     Jan 20   │ │
│  │     High priority • Manager: Marcus                     │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  🟡 Bug Reproduction    Submitted   Alex      Jan 18   │ │
│  │     Medium priority • Waiting for review                │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  ✅ Tutorial Video       Completed   Jessica  Jan 15   │ │
│  │     Approved by Marcus                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Pagination: ← 1 2 3 ... 10 →                               │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Task Detail Page

```
┌─────────────────────────────────────────────────────────────┐
│  Product Demo Recording             [Edit] [Delete] [...]   │
│  Home / Tasks / Product Demo Recording                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Status: Assigned  Priority: High  Due: Jan 20      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────┐             │
│  │  Description                               │             │
│  │  ────────────────────────────────────────  │             │
│  │  Please record a 5-minute demo of our      │             │
│  │  new dashboard feature. Show:              │             │
│  │  - Login process                           │             │
│  │  - Main dashboard                          │             │
│  │  - Creating a new task                     │             │
│  │  - Submitting a recording                  │             │
│  └───────────────────────────────────────────┘             │
│                                                              │
│  ┌───────────────────────────────────────────┐             │
│  │  Details                                   │             │
│  │  ────────────────────────────────────────  │             │
│  │  Created by:    Marcus Johnson             │             │
│  │  Assigned to:   Sarah Chen                 │             │
│  │  Reviewer:      David Lee                  │             │
│  │  Type:          Screen + Audio             │             │
│  │  Est. Duration: 5 minutes                  │             │
│  │  Created:       Jan 15, 2025 10:30 AM     │             │
│  └───────────────────────────────────────────┘             │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Recording                                             │ │
│  │  ──────────────────────────────────────────────────── │ │
│  │                                                        │ │
│  │  Status: Not Started                                   │ │
│  │                                                        │ │
│  │  [🎥 Start Recording]                                  │ │
│  │                                                        │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 Recording Interface (In-Progress)

```
┌─────────────────────────────────────────────────────────────┐
│  Recording in Progress...                                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │                                                         │ │
│  │              🔴 RECORDING                               │ │
│  │                                                         │ │
│  │            Duration: 02:34                              │ │
│  │                                                         │ │
│  │                                                         │ │
│  │          [⏸ Pause]  [⏹ Stop]                          │ │
│  │                                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Recording: Screen + Audio                                   │
│  File size: ~45 MB (estimated)                               │
│                                                              │
│  Tips:                                                       │
│  • Speak clearly into your microphone                        │
│  • Demonstrate each feature slowly                           │
│  • Click "Stop" when finished                                │
└─────────────────────────────────────────────────────────────┘
```

### 5.6 Recording Preview (Before Submit)

```
┌─────────────────────────────────────────────────────────────┐
│  Preview Your Recording                                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │           [VIDEO PLAYER]                                │ │
│  │                                                         │ │
│  │  ─────────────────○──────────                          │ │
│  │  00:45 / 03:12                    [🔊] [⛶]            │ │
│  │                                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Recording Details:                                          │
│  • Duration: 3 minutes 12 seconds                            │
│  • File size: 156 MB                                         │
│  • Quality: 1080p, 30fps                                     │
│  • Audio: Included                                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Are you satisfied with this recording?              │   │
│  │                                                       │   │
│  │  [↻ Re-record]              [✓ Submit Recording]    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.7 Review Screen (Reviewer)

```
┌─────────────────────────────────────────────────────────────┐
│  Review Recording                         Back to Queue →    │
│  Home / Review Queue / Product Demo Recording                │
│                                                              │
│  ┌──────────────────────┐  ┌────────────────────────────┐  │
│  │  Task Requirements   │  │  [VIDEO PLAYER]            │  │
│  │  ──────────────────  │  │                            │  │
│  │  Record 5-min demo:  │  │  ───────○──────────        │  │
│  │  • Login process     │  │  01:23 / 03:12   [⛶]     │  │
│  │  • Dashboard         │  │                            │  │
│  │  • Create task       │  │  Speed: [1x ▼]            │  │
│  │  • Submit recording  │  └────────────────────────────┘  │
│  │                      │                                   │
│  │  Submitted by:       │  ┌────────────────────────────┐  │
│  │  Sarah Chen          │  │  Feedback                  │  │
│  │                      │  │  ───────────────────────── │  │
│  │  Submitted:          │  │                            │  │
│  │  Jan 18, 2:30 PM     │  │  [Write feedback...]       │  │
│  │                      │  │                            │  │
│  └──────────────────────┘  │                            │  │
│                             │                            │  │
│                             │  [✗ Request Revisions]    │  │
│                             │  [✓ Approve Recording]    │  │
│                             └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.8 Settings - Organization Page (Admin Only)

```
┌─────────────────────────────────────────────────────────────┐
│  Organization Settings                                       │
│  Home / Settings / Organization                              │
│                                                              │
│  Tabs: [ General ] [ Branding ] [ Team ] [ Billing ]        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Organization Details                                   │ │
│  │  ────────────────────────────────────────────────────  │ │
│  │                                                         │ │
│  │  Organization Name *                                    │ │
│  │  [Acme Corporation                ]                     │ │
│  │                                                         │ │
│  │  Organization Slug                                      │ │
│  │  revui.app/org/[acme-corp    ]                         │ │
│  │                                                         │ │
│  │  Industry                                               │ │
│  │  [Software/SaaS          ▼]                            │ │
│  │                                                         │ │
│  │  Timezone                                               │ │
│  │  [America/New_York       ▼]                            │ │
│  │                                                         │ │
│  │                         [Save Changes]                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Current Usage                                          │ │
│  │  ────────────────────────────────────────────────────  │ │
│  │                                                         │ │
│  │  Plan: Professional ($99/month)                         │ │
│  │                                                         │ │
│  │  Users:      [████████──] 15 / 50                      │ │
│  │  Storage:    [█████─────] 234 GB / 500 GB              │ │
│  │  Recordings: [███───────] 127 / Unlimited this month   │ │
│  │                                                         │ │
│  │                       [Upgrade Plan →]                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.9 Team Management Page (Admin)

```
┌─────────────────────────────────────────────────────────────┐
│  Team                                      [+ Invite Users]  │
│  Home / Team                                                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Search: [🔍 Search by name or email...]               │ │
│  │  Filters: Role: [All ▼]  Status: [Active ▼]           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Name             Email              Role        Status │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  👤 Sarah Chen    sarah@acme.com    Admin       Active │ │
│  │     Joined: Jan 1, 2025                        [Edit] │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  👤 Marcus Lee    marcus@acme.com   Manager     Active │ │
│  │     Joined: Jan 5, 2025                        [Edit] │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  👤 Alex Kim      alex@acme.com     Member      Active │ │
│  │     Joined: Jan 10, 2025                       [Edit] │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  📧 Jessica Wong  jess@acme.com     Member     Invited │ │
│  │     Invited: Jan 15, 2025                  [Resend]   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Component Specifications

### 6.1 Button Component

**Variants:**

```typescript
// Primary Button (Main CTA)
<Button variant="primary">Create Task</Button>
- Background: Primary Blue (#3B82F6)
- Text: White
- Hover: Primary Hover (#2563EB)
- Height: 40px
- Padding: 12px 24px
- Border radius: 8px
- Font: 14px, medium (500)

// Secondary Button
<Button variant="secondary">Cancel</Button>
- Background: Gray 200 (#E5E7EB)
- Text: Gray 700
- Hover: Gray 300
- Same sizing as Primary

// Destructive Button
<Button variant="destructive">Delete Task</Button>
- Background: Error Red (#EF4444)
- Text: White
- Hover: Darker red
- Same sizing as Primary

// Ghost Button
<Button variant="ghost">View Details</Button>
- Background: Transparent
- Text: Primary Blue
- Hover: Gray 100 background
- Same sizing as Primary

// Icon Button
<Button variant="icon" icon={<Plus />}>Add</Button>
- Icon: 20px
- Padding: 8px 16px
```

**Sizes:**
```typescript
<Button size="sm">Small</Button>      // Height: 32px, Padding: 8px 16px
<Button size="md">Medium</Button>     // Height: 40px, Padding: 12px 24px (default)
<Button size="lg">Large</Button>      // Height: 48px, Padding: 16px 32px
```

**States:**
```typescript
<Button disabled>Disabled</Button>    // Opacity: 0.5, Cursor: not-allowed
<Button loading>Loading...</Button>   // Shows spinner, disabled
```

### 6.2 Input Component

```typescript
// Text Input
<Input
  type="text"
  label="Task Title"
  placeholder="Enter task title..."
  helperText="Be specific and descriptive"
  error="Title is required"
/>

Specs:
- Height: 40px
- Padding: 10px 14px
- Border: 1px solid Gray 300
- Border radius: 8px
- Focus: Primary Blue border (2px)
- Error: Error Red border
- Font: 14px
```

**Variants:**
- Text, email, password, number
- Textarea (multiline)
- Select dropdown
- Date picker
- File upload

### 6.3 Card Component

```typescript
<Card>
  <CardHeader>
    <CardTitle>Recent Tasks</CardTitle>
    <CardDescription>Tasks from the last 7 days</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    <Button>View All</Button>
  </CardFooter>
</Card>

Specs:
- Background: White
- Border: 1px solid Gray 200
- Border radius: 12px
- Padding: 24px
- Shadow: Shadow MD
- Hover: Shadow LG (optional)
```

### 6.4 Table Component

```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Title</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Assignee</TableHead>
      <TableHead>Due Date</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Product Demo</TableCell>
      <TableCell><Badge>Assigned</Badge></TableCell>
      <TableCell>Sarah Chen</TableCell>
      <TableCell>Jan 20, 2025</TableCell>
    </TableRow>
  </TableBody>
</Table>

Specs:
- Header background: Gray 50
- Row border: 1px solid Gray 200
- Row height: 56px
- Hover: Gray 50 background
- Font: 14px
```

### 6.5 Modal/Dialog Component

```typescript
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Task</DialogTitle>
      <DialogDescription>
        Are you sure? This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="secondary">Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

Specs:
- Max width: 500px
- Background: White
- Border radius: 16px
- Shadow: Shadow XL
- Overlay: Black with 0.5 opacity
- Animation: Fade in + scale
```

### 6.6 Badge/Pill Component

```typescript
<Badge variant="success">Completed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Rejected</Badge>
<Badge variant="info">In Progress</Badge>

Specs:
- Padding: 4px 12px
- Border radius: 9999px (fully rounded)
- Font: 12px, medium (500)
- Uppercase

Variants:
- Success: Green background, green text
- Warning: Yellow background, yellow text
- Error: Red background, red text
- Info: Blue background, blue text
- Default: Gray background, gray text
```

### 6.7 Video Player Component

```typescript
<VideoPlayer
  src={recordingUrl}
  poster={thumbnailUrl}
  controls
  playbackSpeeds={[0.5, 1, 1.5, 2]}
/>

Features:
- Play/pause
- Seek bar
- Volume control
- Playback speed selector
- Fullscreen
- Keyboard shortcuts:
  - Space: Play/pause
  - Left/Right arrows: Seek ±5 seconds
  - Up/Down arrows: Volume ±10%
  - F: Fullscreen
  - M: Mute
```

---

## 7. Responsive Design

### 7.1 Breakpoints

```css
/* Mobile */
@media (max-width: 640px)   /* sm */

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px)  /* md */

/* Desktop */
@media (min-width: 1025px)  /* lg */

/* Large Desktop */
@media (min-width: 1280px)  /* xl */
```

### 7.2 Mobile Layout Adaptations

**Navigation:**
- Desktop: Fixed sidebar (240px)
- Mobile: Bottom navigation bar + hamburger menu

**Tables:**
- Desktop: Full table view
- Mobile: Card-based list view

**Forms:**
- Desktop: Multi-column layouts
- Mobile: Single column, full width

**Video Player:**
- Desktop: 16:9 aspect ratio, max-width 1200px
- Mobile: Full width, responsive height

---

## 8. Accessibility

### 8.1 WCAG 2.1 Level AA Compliance

**Color Contrast:**
- Text on background: Minimum 4.5:1 contrast ratio
- Large text (18px+): Minimum 3:1 contrast ratio
- Interactive elements: Minimum 3:1 contrast ratio

**Keyboard Navigation:**
- All interactive elements focusable via Tab
- Visual focus indicators (2px Primary Blue outline)
- Skip navigation link
- Modal trap focus

**Screen Readers:**
- Semantic HTML (header, nav, main, footer)
- ARIA labels for icon-only buttons
- ARIA live regions for dynamic updates
- Alt text for images

**Forms:**
- Label associated with each input
- Error messages linked via aria-describedby
- Required fields indicated with aria-required

---

## 9. Interaction Patterns

### 9.1 Loading States

**Button Loading:**
```
[🔄 Creating Task...]  (Spinner + text, button disabled)
```

**Page Loading:**
```
Skeleton screens matching content layout
```

**Inline Loading:**
```
Shimmer effect on table rows while fetching data
```

### 9.2 Empty States

**No Tasks:**
```
┌────────────────────────────┐
│         📋                 │
│   No tasks yet             │
│   Create your first task   │
│   [+ Create Task]          │
└────────────────────────────┘
```

**No Recordings:**
```
┌────────────────────────────┐
│         🎥                 │
│   No recordings found      │
│   Start recording tasks    │
└────────────────────────────┘
```

### 9.3 Confirmation Dialogs

**Destructive Actions:**
```
┌────────────────────────────┐
│  Delete Task?              │
│  This action cannot be     │
│  undone.                   │
│  [Cancel] [Delete]         │
└────────────────────────────┘
```

---

## 10. Error States & Messaging

### 10.1 Toast Notifications

**Success:**
```
✓ Task created successfully
```

**Error:**
```
✗ Failed to upload recording. Please try again.
```

**Warning:**
```
⚠ Approaching storage limit (90% used)
```

**Info:**
```
ℹ Your recording is being processed
```

**Position:** Top-right
**Duration:** 5 seconds (auto-dismiss)
**Actions:** Dismiss button (X)

### 10.2 Form Validation Errors

**Inline errors (below field):**
```
Email *
[user@example.com                ]
⚠ Please enter a valid email address
```

**Summary errors (top of form):**
```
┌────────────────────────────────────┐
│  ⚠ Please fix the following errors: │
│  • Email is required                │
│  • Password must be at least 8 chars│
└────────────────────────────────────┘
```

### 10.3 Page-Level Errors

**404 Not Found:**
```
┌────────────────────────────┐
│         🔍                 │
│   Page Not Found           │
│   The page you're looking  │
│   for doesn't exist.       │
│   [← Back to Dashboard]    │
└────────────────────────────┘
```

**500 Server Error:**
```
┌────────────────────────────┐
│         😞                 │
│   Something went wrong     │
│   We're working to fix it. │
│   [Try Again] [Contact]    │
└────────────────────────────┘
```

**Network Error:**
```
┌────────────────────────────┐
│         📡                 │
│   Connection Lost          │
│   Check your internet and  │
│   try again.               │
│   [Retry]                  │
└────────────────────────────┘
```

---

## Appendix A: Design Resources

**Figma Files:** [To be created]
**Component Library:** shadcn/ui (https://ui.shadcn.com/)
**Icon Library:** Lucide React (https://lucide.dev/)
**Color Palette:** Tailwind CSS default colors
**Typography:** Inter font family

---

## Appendix B: Usability Testing Plan

**Test Scenarios:**
1. New user onboarding (account creation to first task)
2. Creating and assigning a task
3. Recording and submitting via magic link
4. Reviewing and approving a recording
5. Managing team members (invite, change roles)

**Success Criteria:**
- Task completion rate > 90%
- Time on task < target time
- Error rate < 10%
- User satisfaction > 4/5

---

**Document Prepared By:** AI Assistant
**Stakeholders:** Paul Stevens (Product Owner)
**Status:** Draft - Ready for Review
**Next Steps:** Review design → Create Figma mockups → Implement component library

---

*This is a living document and will be updated as design evolves.*
