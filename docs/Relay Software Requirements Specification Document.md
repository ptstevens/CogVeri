# Relay Software Requirements Specification Document

## System Design
- Browser-based internal platform for secure screen recording (self-guided and live) with feedback workflows.
- Separation between frontend web app, backend API layer, and dedicated video storage with end-to-end encryption.

## Architecture pattern
- **Microservices-oriented modular backend** (stateless API, video processing, notification services).
- **SPA (Single Page Application) frontend** using a component-based framework.
- Follows a client-server architecture with serverless/media services for file handling.

## State management
- Client-side state managed via React’s Context API & Reducer pattern (for auth, notification, and workflow state).
- Backend persists workflow states in a relational database.

## Data flow
- User actions (task creation, recording, review) trigger API calls.
- Video blobs streamed from browser using MediaStream Recording API, uploaded to secure object storage via RESTful endpoint.
- All task/feedback events pass through authenticated HTTP(S) requests; push notifications via WebSockets or server-sent events for real-time updates.

## Technical Stack
- **Frontend:** React (w/ TypeScript), Vite, Tailwind CSS.
- **Backend:** Node.js (TypeScript) with Express.
- **Database:** PostgreSQL (workflow, feedback, permissions).
- **Video Storage:** Encrypted AWS S3 (private bucket, pre-signed URLs) or equivalent enterprise cloud storage (i.e., Google Cloud Storage or Azure Blob Storage).
- **Authentication:** SSO via SAML2/OpenID Connect (Integrates with corporate IdP).
- **Notifications/Integrations:** Slack webhooks, optional in-app notification center.
- **Deployment:** Docker, orchestrated on AWS ECS or equivalent; CI/CD via Github Actions.

## Authentication Process
- SSO enforced for all entry points (SPA and API).
- OAuth/SAML2/OpenID Connect for authentication; JWT session tokens in the browser.
- RBAC (role-based) for finer permissions (admin, manager, reviewer, employee).

## Route Design
- **Frontend SPA:**
  - `/login` – SSO entry
  - `/dashboard` – Main user overview
  - `/tasks` – Task management/assignment
  - `/record` – Start a screen recording/live session
  - `/review/:id` – Review incoming submissions
  - `/profile` – User profile/settings
- **API Endpoints:**
  - `POST /api/tasks` – Create/assign tasks
  - `GET /api/tasks` – List/filter tasks
  - `POST /api/recordings/upload` – Upload screen recording
  - `GET /api/reviews/:id` – Get review task
  - `POST /api/reviews/:id/feedback` – Submit review
  - `POST /api/notifications/slack` – Notify user via Slack webhook

## API Design
- RESTful; JSON request/response bodies.
- OpenAPI/Swagger documentation for endpoints.
- Video uploads via multi-part form data; metadata JSON payloads.
- All endpoints require valid JWT, with secondary checks for workflow roles.

## Database Design ERD
- **Users:** (id, name, email, role, sso_id)
- **Tasks:** (id, created_by, assigned_to, status, due_date, recording_url, created_at, updated_at)
- **Recordings:** (id, task_id, file_url, started_at, completed_at, duration)
- **Reviews:** (id, recording_id, reviewer_id, submitted_at, comments, status)
- **Notifications:** (id, user_id, type, message, created_at, read)
