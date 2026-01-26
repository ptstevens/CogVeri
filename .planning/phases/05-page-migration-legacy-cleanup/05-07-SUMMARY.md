---
phase: 05-page-migration-legacy-cleanup
plan: 07
subsystem: frontend-ui
tags: [loading, route-guards, settings, design-system]

requires:
  - "05-05"

provides:
  - "Route guards using design system FullScreenLoader"
  - "Settings pages using design system FullScreenLoader"
  - "Elimination of LoadingSpinner fullScreen usages"

affects:
  - "Future fullScreen loading patterns should use FullScreenLoader"
  - "LoadingSpinner retained for inline loading only"

tech-stack:
  added: []
  patterns:
    - "FullScreenLoader for route guards and page-level loading states"

key-files:
  created: []
  modified:
    - frontend/src/components/common/ProtectedRoute.tsx
    - frontend/src/components/common/AdminRoute.tsx
    - frontend/src/pages/settings/Billing.tsx
    - frontend/src/pages/settings/OrganizationSettings.tsx

decisions:
  - id: "fullscreen-loader-route-guards"
    title: "Use FullScreenLoader for route guards"
    rationale: "Route guards need full-screen blocking UI during auth check - FullScreenLoader provides consistent design system implementation"
  - id: "fullscreen-loader-settings-billing"
    title: "Use FullScreenLoader for settings page initial loads"
    rationale: "Initial billing data loads require blocking UI - FullScreenLoader provides better UX than inline loading"
  - id: "keep-loadingspinner-inline"
    title: "Retain LoadingSpinner for inline loading states"
    rationale: "FullScreenLoader is specifically for full-screen blocking - inline loading still uses LoadingSpinner until design system alternative created"

metrics:
  duration: "2.5 min"
  completed: "2026-01-22"
---

# Phase 05 Plan 07: Migrate fullScreen loading usages to FullScreenLoader Summary

**One-liner:** Migrated route guards and settings pages from LoadingSpinner fullScreen to design system FullScreenLoader

## What Was Built

Replaced all LoadingSpinner fullScreen usages in route guards and settings pages with the design system FullScreenLoader component:

1. **Route Guards Migration**
   - ProtectedRoute.tsx: Loading state during auth check
   - AdminRoute.tsx: Loading state during admin verification

2. **Settings Pages Migration**
   - Billing.tsx: Initial billing information load
   - OrganizationSettings.tsx: Billing tab load state

## Migration Pattern

Each migration followed the same pattern:

**Before:**
```tsx
import LoadingSpinner from '../ui/LoadingSpinner';
// ...
<LoadingSpinner fullScreen message="Loading..." />
```

**After:**
```tsx
import { FullScreenLoader } from '../ui/Loading';
// ...
<FullScreenLoader message="Loading..." />
```

**Note:** LoadingSpinner imports retained where files use inline loading (non-fullScreen).

## Key Changes

### Route Guards (Components)

| File | Import Change | Usage Change |
|------|--------------|--------------|
| ProtectedRoute.tsx | `FullScreenLoader` from `../ui/Loading` | `<FullScreenLoader message="Loading..." />` |
| AdminRoute.tsx | `FullScreenLoader` from `../ui/Loading` | `<FullScreenLoader message="Loading..." />` |

### Settings Pages

| File | Import Change | Usage Change | Notes |
|------|--------------|--------------|-------|
| Billing.tsx | Added `FullScreenLoader` to Loading import | `<FullScreenLoader message="Loading billing information..." />` | LoadingSpinner kept for inline usage (line 452) |
| OrganizationSettings.tsx | Added `FullScreenLoader` to Loading import | `<FullScreenLoader message="Loading billing information..." />` | LoadingSpinner kept for inline usage (line 590) |

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria

- [x] ProtectedRoute.tsx uses FullScreenLoader
- [x] AdminRoute.tsx uses FullScreenLoader
- [x] Billing.tsx uses FullScreenLoader for initial load
- [x] OrganizationSettings.tsx uses FullScreenLoader for billing tab
- [x] No more `LoadingSpinner fullScreen` usages in codebase
- [x] TypeScript compiles without errors

## Verification Results

```bash
# TypeScript compilation
✓ cd frontend && npx tsc --noEmit

# No fullScreen LoadingSpinner usages remain
✓ ! grep -r "LoadingSpinner fullScreen" frontend/src

# FullScreenLoader imports present
✓ grep -r "FullScreenLoader" frontend/src/components/common frontend/src/pages/settings
```

All route guards and settings pages now use the design system FullScreenLoader for blocking loading states.

## Testing Notes

### Manual Testing Required

1. **Route Guards:**
   - Navigate to protected route while logged out
   - Verify FullScreenLoader shows during auth check
   - Navigate to admin route as non-admin
   - Verify FullScreenLoader shows during role check

2. **Settings Pages:**
   - Navigate to Billing page
   - Verify FullScreenLoader shows during initial data load
   - Navigate to Settings > Billing tab
   - Verify FullScreenLoader shows during billing data load

### Visual Consistency

FullScreenLoader provides:
- Semi-transparent white overlay (bg-white bg-opacity-75)
- Centered spinner (default size lg)
- Message text below spinner
- z-index 50 for proper layering

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Recommendations:**

1. **Future inline loading migration:** Create design system alternative for inline loading states (currently using legacy LoadingSpinner)
2. **Audit remaining LoadingSpinner usages:** Identify which are fullScreen vs inline, plan migration strategy
3. **Consider skeleton screens:** For data-heavy pages, skeleton screens provide better perceived performance than spinners

## Related Documentation

- Design system: `frontend/src/components/ui/Loading/FullScreenLoader.tsx`
- Related components: `frontend/src/components/ui/Loading/Spinner.tsx`
- Gap closure plan: `.planning/phases/05-page-migration-legacy-cleanup/05-05-PLAN.md` (FullScreenLoader creation)
