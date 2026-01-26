---
phase: 01-foundation-infrastructure
plan: 02
subsystem: ui
tags: [eslint, tailwindcss, linting, design-system, ci]

# Dependency graph
requires:
  - phase: 01-foundation-infrastructure/01-01
    provides: Tailwind config that ESLint rules validate against
provides:
  - ESLint Tailwind plugin catching arbitrary values
  - ESLint Tailwind plugin catching dynamic class construction
  - ESLint Tailwind plugin enforcing class ordering
  - CI enforcement of Tailwind rules
affects: [02-design-system-core, all-frontend-development]

# Tech tracking
tech-stack:
  added: [eslint-plugin-tailwindcss@3.18.2]
  patterns: [tailwind-linting, design-token-enforcement]

key-files:
  created: []
  modified:
    - frontend/.eslintrc.json
    - frontend/package.json

key-decisions:
  - "no-contradicting-classname as error (blocks CI), others as warnings (visible but non-blocking)"
  - "Start permissive on arbitrary values, tighten to error after Phase 2 design system"
  - "Configure callees for cn, clsx, classnames, cva to lint utility functions"

patterns-established:
  - "Tailwind ESLint enforcement: all frontend code subject to class ordering and arbitrary value checks"
  - "Design token enforcement via linting: bypass requires explicit eslint-disable comment"

# Metrics
duration: 8min
completed: 2026-01-21
---

# Phase 1 Plan 2: Tailwind ESLint Enforcement Summary

**ESLint plugin catching arbitrary Tailwind values, dynamic class construction, and contradicting classes with CI enforcement**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-21T12:15:00Z
- **Completed:** 2026-01-21T12:23:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Installed eslint-plugin-tailwindcss@3.18.2 with 6 Tailwind-specific rules
- Configured rules to catch arbitrary values (`text-[#123456]`), custom classnames, and contradicting classes
- Verified rules catch old hardcoded colors like `text-[#14b8a6]` (former primary-500)
- Fixed 1 pre-existing contradicting classname error blocking CI
- CI integration verified (code-quality.yml already runs lint)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install and configure eslint-plugin-tailwindcss** - `734d3ec` (feat)
2. **Task 2: Verify rules and fix contradicting classname error** - `11a559f` (fix)
3. **Task 3: Verify CI integration** - No commit (verification only)

## Files Created/Modified
- `frontend/.eslintrc.json` - Extended with tailwindcss/recommended and 6 rule configurations
- `frontend/package.json` - Added eslint-plugin-tailwindcss devDependency
- `frontend/src/components/tasks/EditTaskModal.tsx` - Fixed conflicting block/flex classes

## Decisions Made

1. **Rule severity levels:**
   - `no-contradicting-classname`: error (these are always bugs, should block CI)
   - `no-arbitrary-value`: warn (flag for review but allow calc() cases)
   - `no-custom-classname`: warn (catches non-Tailwind classes)
   - `classnames-order`: warn (consistency, not blocking)

2. **Callees configuration:** Added `cn`, `clsx`, `classnames`, `cva` so ESLint parses class utilities

3. **Start permissive:** Warnings-first approach allows existing code to remain while flagging new violations for review. Can tighten to errors after design system components provide alternatives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed conflicting display classes in EditTaskModal**
- **Found during:** Task 2 (Audit existing code)
- **Issue:** `className="block ... flex"` had both block and flex display properties
- **Fix:** Removed `block` class, kept `flex` since label uses flexbox layout
- **Files modified:** frontend/src/components/tasks/EditTaskModal.tsx
- **Verification:** ESLint no longer reports no-contradicting-classname error
- **Committed in:** 11a559f

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix - this was a real bug (conflicting CSS) that blocked CI

## Issues Encountered

**Pre-existing codebase violations:**
- 4379 total lint problems (93 errors, 4286 warnings)
- Tailwind-specific: 2977 class order, 795 shorthand, 63 custom classname, 42 arbitrary value
- Non-Tailwind errors: react/no-unescaped-entities, prefer-const, TypeScript config parsing

These are documented as technical debt but NOT fixed in this plan. The plan's goal is enforcement going forward, not immediate cleanup. A future cleanup task can address these.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ESLint enforcement active - new violations will be caught during development
- CI will fail on contradicting classnames (errors)
- CI will surface warnings for arbitrary values (visible in logs)
- Ready for design system component development (Phase 2)

---
*Phase: 01-foundation-infrastructure*
*Completed: 2026-01-21*
