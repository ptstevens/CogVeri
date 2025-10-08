# Relay Product Requirements Document

## Elevator Pitch
Relay is a browser-based internal platform that enables employees to securely demonstrate their understanding of business systems, workflows, and feature configurations through self-guided or live-recorded screen sessions. Team leads and managers can assign tasks, employees can capture and submit evidence of knowledge directly in the browser (no installs), and reviewers can assess, comment, and identify knowledge gaps—all seamlessly integrated within the company network with SSO and Slack support.

## Who is this App For
- **All Employees:** Anyone assigned a demonstration task, accessible via a secure internal link.
- **Team Leads & Managers:** Stakeholders who create, assign, and track knowledge demonstration requests.
- **Reviewers:** Individuals responsible for watching recordings and providing actionable feedback or documentation of knowledge gaps.

## Functional Requirements
- **Task Assignment:**
  - Team leads/managers can create, assign, and track screen recording or live demo tasks.
  - Secure, direct links sent to employees; access restricted to internal accounts.

- **Screen Capture:**
  - Employees can record or live-share their screens directly from the browser (preferably Chrome; support for additional browsers in future).
  - Sessions may be self-guided or live with a reviewer; all sessions are recorded.

- **Review and Feedback:**
  - Reviewers can watch recordings within Relay and leave open comments highlighting knowledge gaps or suggested improvements.
  - Task metadata (reviewer, participant, timestamps, feedback) securely archived.

- **Security & Authentication:**
  - Login required for all users via company SSO.
  - Relay is fully internal; no data leaves the corporate network.

- **Notifications & Integrations:**
  - Optional Slack integration for task assignments, submissions, and feedback prompts.
  - Dashboard alerts for all key workflow events.

- **Storage & Auditing:**
  - Recordings and feedback securely stored, searchable, and accessible for compliance or audits.

- **Extensibility:**
  - Designed to support additional features (e.g., structured rubric-based review, browser compatibility, advanced permissions) as needed.

## User Stories

- **Task Assignment:**  
  _As a team lead, I want to assign a screen recording demo to employees so I can verify their understanding of a workflow or feature._

- **Screen Recording:**  
  _As an employee, I need to log in, record or share my screen, and submit a demo securely from my browser with no extra installs._

- **Review and Feedback:**  
  _As a reviewer, I want to watch recorded sessions and leave open-text comments documenting strengths and gaps._

- **Progress Tracking:**  
  _As a manager, I want to see who has completed tasks and what feedback has been shared, so I can monitor team knowledge._

- **Security and Notification:**  
  _As a user, I need to log in via SSO and receive notifications through Slack or the dashboard, to keep tasks and feedback secure and visible._

## User Interface

- **Dashboard:**
  - Clean, modern UI presenting assigned tasks, submission statuses, and feedback to each user.
  
- **Task View:**
  - Task cards with assignment details, one-click to record or join a live demo, and clear deadlines/instructions.

- **Screen Recording/Live Share:**
  - Intuitive, browser-based recording and live-sharing panel with progress and submission controls; no downloads needed.

- **Review Interface:**
  - Built-in video player for watching submissions, open-text comment area for feedback, summary of gaps or strengths.
  
- **Notifications:**
  - Slack and dashboard notifications for new assignments, submissions, and feedback, plus a notification history center.
  
- **Access & Security:**
  - Prominent SSO login, enforced access controls, and session management for privacy and compliance.

- **Responsive Design:**
  - Optimized for desktop browser (initially Chrome), scalable components for future browser support.
