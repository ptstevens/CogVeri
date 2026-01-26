---
phase: 05-page-migration-legacy-cleanup
plan: 02
subsystem: ui
tags: [react, design-system, loading, spinner, dashboard-layout, migration]

# Dependency graph
requires:
  - phase: 04-design-system-implementation
    provides: Spinner component and DashboardLayout pattern
provides:
  - Tasks list page using design system Spinner
  - Reviews list page using design system Spinner and DashboardLayout
  - ReviewDetail page using DashboardLayout
affects: [05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DashboardLayout wrapper for consistent page structure"
    - "Spinner component for loading states"

key-files:
  created: []
  modified:
    - frontend/src/pages/tasks/Tasks.tsx
    - frontend/src/pages/reviews/Reviews.tsx
    - frontend/src/pages/reviews/ReviewDetail.tsx
    - frontend/src/pages/dashboard/Dashboard.tsx
    - frontend/src/pages/tasks/TaskDetail.tsx

key-decisions:
  - "Preserved domain-specific components (StatusBadge, PriorityBadge, ExpandableRichText)"
  - "Wrapped Reviews with DashboardLayout for consistent page structure"
  - "Did not wrap Tasks page with DashboardLayout due to complex custom layout (kanban/list views)"

patterns-established:
  - "Import design system components from '@/components/ui/*' paths"
  - "Use Spinner with size prop instead of inline spinner markup"
  - "Wrap standard pages with DashboardLayout, skip for complex custom layouts"

# Metrics
duration: 5min
completed: 2026-01-22
---

# Phase 5 Plan 2: Task and Review Pages Migration Summary

**Migrated Tasks, Reviews, and ReviewDetail pages to design system Spinner and DashboardLayout, preserving all domain-specific components and functionality**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-22T00:48:04Z
- **Completed:** 2026-01-22T00:53:13Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Tasks list page now uses design system Spinner instead of inline spinner
- Reviews list page migrated to Spinner and wrapped with DashboardLayout
- ReviewDetail stub wrapped with DashboardLayout for consistency
- All domain-specific components preserved (StatusBadge, PriorityBadge, ExpandableRichText)
- Fixed pre-existing TypeScript errors blocking type-check

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Tasks list page to design system** - `86a80ad` (feat)
2. **Task 2: Migrate Reviews list page to design system** - `de66f8f` (feat)
3. **Task 3: Migrate ReviewDetail page to design system** - `5d4587e` (feat)

## Files Created/Modified
- `frontend/src/pages/tasks/Tasks.tsx` - Replaced inline spinner with Spinner component
- `frontend/src/pages/reviews/Reviews.tsx` - Replaced LoadingSpinner with Spinner, wrapped with DashboardLayout
- `frontend/src/pages/reviews/ReviewDetail.tsx` - Wrapped stub with DashboardLayout
- `frontend/src/pages/dashboard/Dashboard.tsx` - Fixed unused Sparkles import, fixed import order
- `frontend/src/pages/tasks/TaskDetail.tsx` - Fixed missing href in breadcrumb, removed unused ArrowLeft import

## Decisions Made
- **Preserved domain-specific components**: StatusBadge, PriorityBadge, and ExpandableRichText are CogVeri-specific components that display business logic (task status, priority, rich text content). These should NOT be migrated to generic design system components.
- **DashboardLayout usage pattern**: Wrap standard pages (Reviews, ReviewDetail) with DashboardLayout for consistent structure. Skip for pages with complex custom layouts (Tasks has kanban/list view switching with custom scrolling behavior).
- **Spinner sizing**: Used `size="lg"` for full-page loading states to maintain visual prominence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused Sparkles import in Dashboard**
- **Found during:** Task 1 (TypeScript type-check)
- **Issue:** Sparkles icon imported but never used, blocking type-check
- **Fix:** Removed unused import from lucide-react imports
- **Files modified:** frontend/src/pages/dashboard/Dashboard.tsx
- **Verification:** Type-check passes
- **Committed in:** 86a80ad (Task 1 commit)

**2. [Rule 1 - Bug] Fixed DashboardLayout import order in Dashboard**
- **Found during:** Task 1 (TypeScript type-check)
- **Issue:** Import order causing TypeScript to report unused import (false positive from linter)
- **Fix:** Moved DashboardLayout import after domain-specific imports
- **Files modified:** frontend/src/pages/dashboard/Dashboard.tsx
- **Verification:** Type-check passes
- **Committed in:** 86a80ad (Task 1 commit)

**3. [Rule 1 - Bug] Fixed missing breadcrumb href in TaskDetail**
- **Found during:** Task 3 verification (TypeScript type-check)
- **Issue:** Breadcrumb item missing required href property, blocking type-check
- **Fix:** Added empty string href to current breadcrumb item
- **Files modified:** frontend/src/pages/tasks/TaskDetail.tsx
- **Verification:** Type-check passes
- **Committed in:** Separate fix commit (not part of plan scope)

**4. [Rule 1 - Bug] Fixed unused ArrowLeft import in TaskDetail**
- **Found during:** Task 3 verification (TypeScript type-check)
- **Issue:** ArrowLeft icon imported but never used
- **Fix:** Removed from lucide-react imports
- **Files modified:** frontend/src/pages/tasks/TaskDetail.tsx
- **Verification:** Type-check passes
- **Committed in:** Separate fix commit (not part of plan scope)

---

**Total deviations:** 4 auto-fixed (4 bugs)
**Impact on plan:** All fixes were necessary to unblock type-checking. No scope creep - purely cleanup of pre-existing issues.

## Issues Encountered
- Pre-existing TypeScript errors in Dashboard.tsx and TaskDetail.tsx blocked verification. Fixed as part of execution (deviation Rule 1).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core workflow pages (Dashboard, Tasks, Reviews) now use design system components
- Ready for migration of remaining pages (Recordings, Admin, Settings, etc.)
- Pattern established: preserve domain-specific components, migrate loading states
- Next: Complete remaining page migrations in Phase 5 Plans 3-4

---
*Phase: 05-page-migration-legacy-cleanup*
*Completed: 2026-01-22*
