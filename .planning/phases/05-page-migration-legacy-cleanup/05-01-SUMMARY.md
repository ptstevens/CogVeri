---
phase: 05-page-migration-legacy-cleanup
plan: 01
subsystem: ui
tags: [react, design-system, migration, spinner, layout, empty-state]

# Dependency graph
requires:
  - phase: 04-design-system-patterns
    provides: DashboardLayout, Spinner, EmptyState components
provides:
  - Migrated Dashboard, TaskDetail, and Recordings pages to design system
  - Established page migration pattern (replace LoadingSpinner → Spinner, wrap with DashboardLayout)
  - EmptyState pattern for stub pages
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page migration: Replace LoadingSpinner with Spinner from design system"
    - "DashboardLayout wrapper for consistent page structure and breadcrumbs"
    - "EmptyState for stub/empty pages"

key-files:
  created: []
  modified:
    - frontend/src/pages/dashboard/Dashboard.tsx
    - frontend/src/pages/tasks/TaskDetail.tsx
    - frontend/src/pages/recordings/Recordings.tsx
    - .gitignore

key-decisions:
  - "Use DashboardLayout for all dashboard-style pages to provide consistent structure"
  - "TaskDetail uses breadcrumbs (Tasks > Task Title) for navigation context"
  - "Recordings stub uses large EmptyState with Video icon for prominent empty state"

patterns-established:
  - "Page migration: Import design system components (Spinner, DashboardLayout) and remove legacy equivalents"
  - "Preserve domain-specific components (StatusBadge, PriorityBadge, RichTextContent)"
  - "Use showBreadcrumbs={false} for top-level pages like Dashboard"

# Metrics
duration: 6m
completed: 2026-01-22
---

# Phase 05 Plan 01: Page Migration - Initial Set Summary

**Dashboard, TaskDetail, and Recordings pages migrated to design system with DashboardLayout pattern, Spinner component, and EmptyState for stubs**

## Performance

- **Duration:** 6 min 3 sec
- **Started:** 2026-01-22T00:48:05Z
- **Completed:** 2026-01-22T00:54:04Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Dashboard page wrapped with DashboardLayout, using design system Spinner instead of LoadingSpinner
- TaskDetail page migrated to DashboardLayout with breadcrumb navigation and Spinner
- Recordings stub page updated to use EmptyState component with consistent layout
- Fixed gitignore to allow source code in frontend/src/pages/recordings/ (was blocking video recordings, not source files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Dashboard page to design system** - `61a846c` (feat)
   - Note: Dashboard was already partially migrated in earlier commit `86a80ad`
   - This task fixed backend TypeScript error (unused `req` parameter)
2. **Task 2: Migrate TaskDetail page to design system** - `8490d2e` (feat)
3. **Task 3: Migrate Recordings stub page to design system** - `007a72f` (feat)

## Files Created/Modified
- `frontend/src/pages/dashboard/Dashboard.tsx` - Wrapped with DashboardLayout, replaced LoadingSpinner with Spinner
- `frontend/src/pages/tasks/TaskDetail.tsx` - Wrapped with DashboardLayout, added breadcrumbs, replaced inline spinner with Spinner component
- `frontend/src/pages/recordings/Recordings.tsx` - Replaced stub placeholder with EmptyState component
- `.gitignore` - Changed `recordings/` to `/recordings/` to allow source code in frontend/src/pages/recordings/
- `backend/src/controllers/admin.controller.ts` - Fixed unused `req` parameter in listImpersonationSessions method

## Decisions Made
- Use `DashboardLayout` with breadcrumbs for detail pages (TaskDetail) to provide navigation context
- Use `showBreadcrumbs={false}` for top-level pages (Dashboard, Recordings) to reduce visual clutter
- Preserve all domain-specific components (StatusBadge, PriorityBadge, RichTextContent) - only replace generic UI components
- Use large `EmptyState` for stub pages to make empty state prominent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed backend TypeScript error**
- **Found during:** Task 1 (Dashboard migration)
- **Issue:** TypeScript error in `backend/src/controllers/admin.controller.ts` - unused `req` parameter in `listImpersonationSessions` method
- **Fix:** Prefixed parameter with underscore (`_req`) to indicate intentionally unused
- **Files modified:** backend/src/controllers/admin.controller.ts
- **Verification:** `npm run type-check` passes
- **Committed in:** 61a846c (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed gitignore blocking source code**
- **Found during:** Task 3 (Recordings stub migration)
- **Issue:** `.gitignore` had `recordings/` pattern that blocked `frontend/src/pages/recordings/` source code (meant to block uploaded video files)
- **Fix:** Changed pattern to `/recordings/` to only ignore root-level recordings directory
- **Files modified:** .gitignore
- **Verification:** Git add succeeded for frontend/src/pages/recordings/Recordings.tsx
- **Committed in:** 007a72f (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes were necessary to unblock execution. No scope creep.

## Issues Encountered
- Dashboard was already partially migrated in commit `86a80ad` (prior to this plan execution). Task 1 effectively only fixed the backend TypeScript error.
- Gitignore pattern `recordings/` was too broad - intended to ignore uploaded video recordings but also blocked source code in `frontend/src/pages/recordings/`

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Page migration pattern established (replace LoadingSpinner → Spinner, wrap with DashboardLayout)
- Ready to migrate remaining pages (Tasks list, Reviews, Settings)
- Domain-specific components preserved and working (StatusBadge, PriorityBadge, RichTextContent)

**Scope note for PAGE-03 (Recording/Playback UI):**
This plan completes PAGE-03 in-scope coverage. The Recordings stub page is the only non-domain-specific recording page. RecordingSession, RecordingSetup, and LiveSession are domain-specific pages with complex real-time recording logic and are OUT OF SCOPE per 05-RESEARCH.md.

---
*Phase: 05-page-migration-legacy-cleanup*
*Completed: 2026-01-22*
