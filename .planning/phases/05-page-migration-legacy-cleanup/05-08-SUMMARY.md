---
phase: 05-page-migration-legacy-cleanup
plan: 08
subsystem: ui
tags: [react, design-system, barrel-export, spinner, loading]

# Dependency graph
requires:
  - phase: 05-05
    provides: FullScreenLoader design system component
  - phase: 05-04
    provides: Barrel export organization pattern
provides:
  - Button component uses design system Spinner
  - Accurate barrel export categorization (design system vs legacy vs domain-specific)
  - FullScreenLoader exported from main barrel
affects: [any-future-component-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Accurate component categorization in barrel exports"]

key-files:
  created: []
  modified:
    - frontend/src/components/ui/Button.tsx
    - frontend/src/components/ui/index.ts

key-decisions:
  - "Use color='white' for Button Spinner since primary variant (colored background) is most common"
  - "Button, Card, Input, Select, Tabs are design system components (use CVA with design tokens)"
  - "LoadingSpinner is legacy component (deprecated in favor of Spinner/FullScreenLoader)"

patterns-established:
  - "Barrel export sections: Design System (Primitives/Loading/Composites/Patterns), Legacy, Domain-Specific"

# Metrics
duration: 1min
completed: 2026-01-22
---

# Phase 5 Plan 8: Barrel Corrections Summary

**Button migrated to design system Spinner; barrel exports accurately categorize design system vs legacy components**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-22T14:04:26Z
- **Completed:** 2026-01-22T14:05:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Button uses design system Spinner instead of LoadingSpinner
- Barrel export correctly categorizes Button, Card, Input, Select, Tabs as design system components
- LoadingSpinner properly labeled as legacy with deprecation note
- FullScreenLoader added to Loading exports

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Button to use design system Spinner** - `fe62701` (feat)
2. **Task 2: Correct barrel export categorization** - `e27fa4f` (refactor)

## Files Created/Modified
- `frontend/src/components/ui/Button.tsx` - Uses Spinner from Loading with color="white"
- `frontend/src/components/ui/index.ts` - Reorganized into Design System (Primitives/Loading/Composites/Patterns), Legacy, Domain-Specific sections

## Decisions Made

**Color choice for Spinner:**
- Used `color="white"` since primary variant (colored background) is most common
- White spinner is still visible on secondary/ghost buttons due to contrast

**Categorization criteria:**
- Design System: Components using CVA with design tokens
- Legacy: Components not yet migrated to design system patterns
- Domain-Specific: CogVeri-specific components (intentionally not generic)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 complete. Design system migration foundation established:
- All design system primitives, composites, and patterns implemented
- Key pages migrated (Dashboard, Tasks, TaskDetail, AdminDashboard, Settings, Auth)
- FullScreenLoader replaces LoadingSpinner for fullscreen loading states
- Barrel exports accurately reflect component status

Remaining work for future iterations:
- Migrate remaining LoadingSpinner inline usages to Spinner
- Complete Modal → ModalNew migration across codebase
- Add EmptyState illustrations for better visual design

---
*Phase: 05-page-migration-legacy-cleanup*
*Completed: 2026-01-22*
