# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-21)

**Core value:** Unified color and branding system - consistent visual identity with green accents on a neutral base, applied uniformly across every page.
**Current focus:** Milestone complete - All 5 phases executed

## Current Position

Phase: 5 of 5 (Page Migration & Legacy Cleanup)
Plan: 8 of 8 in current phase
Status: Phase complete
Last activity: 2026-01-22 - Completed 05-08-PLAN.md (Gap closure: Barrel corrections)

Progress: [====================] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: 4 min
- Total execution time: 80 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-infrastructure | 3 | 17 min | 6 min |
| 02-primitive-components | 3 | 8 min | 3 min |
| 03-composite-components-feedback | 3 | 13 min | 4 min |
| 04-pattern-components-data-display | 3 | 13 min | 4 min |
| 05-page-migration-legacy-cleanup | 8 | 29 min | 4 min |

**Recent Trend:**
- Last 5 plans: 05-04 (4 min), 05-05 (2 min), 05-06 (1 min), 05-07 (3 min), 05-08 (1 min)
- Trend: Consistently efficient execution (1-4 min average)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Foundation-first approach confirmed (cannot safely refresh UI without design tokens, testing infrastructure)
- Full atomic design system confirmed (Primitives -> Composites -> Patterns -> Pages)
- Hard legacy deletion deadline confirmed (prevents indefinite dual-system state)
- CogVeri-specific features out of scope (video/rubric work is separate project)
- RGB values without wrapper for Tailwind opacity modifiers (01-01)
- Full 50-950 scales for success/warning/error colors (01-01)
- no-contradicting-classname as error, others as warnings (01-02)
- Configure callees for cn, clsx, classnames, cva (01-02)
- Bundle thresholds: JS 200KB gzip, CSS 60KB gzip per file (01-03)
- WCAG 2.2 AA compliance scope for accessibility testing (01-03)
- Visual regression baselines generated on-demand (01-03)
- Card padding variant replaces noPadding prop for consistency (02-02)
- Badge is generic; StatusBadge/PriorityBadge remain domain-specific (02-02)
- Icon wrapper intentionally thin - direct lucide usage valid for custom sizing (02-02)
- Use design tokens (error-600/700/800) for Button danger variant (02-01)
- Native input with peer styling for Checkbox over Radix/headless (02-01)
- Storybook 10.2.0 with Vite builder for fast builds (02-03)
- addon-a11y enabled with color-contrast and label rules (02-03)
- Stories co-located in component folders (02-03)
- Radix Dialog for accessible modals with built-in focus trap (03-02)
- Compound component pattern via Object.assign for flexible composition (03-02)
- Portal rendering for modals to prevent z-index issues (03-02)
- Toast wrapper with 5-toast stacking limit via useToasterStore (03-01)
- Toast vs Alert distinction: ephemeral auto-dismiss vs persistent acknowledgment (03-01)
- CVA variants for semantic feedback colors in Alert component (03-01)
- FormField supports external error prop or validate prop for onBlur auto-validation (03-03)
- Dropdown uses downshift useCombobox for ARIA-compliant keyboard navigation (03-03)
- cloneElement pattern injects accessibility props without forcing API changes (03-03)
- Illustration prop takes precedence over icon in EmptyState (03-03)
- TanStack Table v8 for headless table logic without bundle bloat (04-01)
- OnChangeFn type for pagination/sorting callbacks to support updater pattern (04-01)
- Manual pagination/sorting modes for server-side data operations (04-01)
- Native buttons for pagination over custom Button component (lighter weight) (04-01)
- lucide-react confirmed as exclusive icon library (04-02)
- WAI-ARIA nav with aria-label for Breadcrumbs (04-02)
- DashboardLayout is page content template, not replacement for Layout.tsx (04-03)
- Chart colors use RGB values directly (recharts doesn't support CSS variables) (04-03)
- PieChart includes screen reader fallback table for accessibility (04-03)
- Use DashboardLayout for all dashboard-style pages to provide consistent structure (05-01)
- TaskDetail uses breadcrumbs (Tasks > Task Title) for navigation context (05-01)
- Use showBreadcrumbs={false} for top-level pages like Dashboard to reduce clutter (05-01)
- Preserve domain-specific components (StatusBadge, PriorityBadge, RichTextContent) - only replace generic UI (05-01)
- Use large EmptyState for stub pages to make empty state prominent (05-01)
- Mixed legacy/design-system loading: use design system Spinner for inline, keep LoadingSpinner for fullscreen until FullScreenLoader component created (05-03)
- Auth pages already compatible with current state - no changes needed (05-03)
- Organize barrel exports by category: Legacy, Design System, Domain-Specific (05-04)
- Re-export design system components from barrel for convenience (05-04)
- LoadingSpinner KEPT (36+ usages, fullScreen + message props not in design system) (05-04)
- Default size lg for FullScreenLoader (matches LoadingSpinner large fullScreen usage) (05-05)
- Semi-transparent white overlay (bg-white bg-opacity-75) for consistent visual treatment (05-05)
- Use size="lg" for auth page spinners to match LoadingSpinner visual weight (05-06)
- Keep existing styled containers (bg-white rounded-2xl shadow-lg) unchanged (05-06)
- Use FullScreenLoader for route guards and page-level blocking loads (05-07)
- Retain LoadingSpinner for inline loading states until design system alternative created (05-07)
- Use color="white" for Button Spinner since primary variant (colored background) is most common (05-08)
- Button, Card, Input, Select, Tabs are design system components (use CVA with design tokens) (05-08)
- LoadingSpinner is legacy component (deprecated in favor of Spinner/FullScreenLoader) (05-08)

### Pending Todos

None yet.

### Blockers/Concerns

**Technical debt flagged (01-02):**
- Frontend has 4400 lint problems (103 errors, 4297 warnings) as of 03-03
- Most are pre-existing: class ordering, shorthand, unescaped entities, Storybook imports
- Does not block work but should be addressed in a cleanup sprint

**Research flags for planning:**
- ✅ Phase 4: TanStack Table selected (decision made in 04-01)
- Visual regression: Using Playwright (decision made in 01-03)

## Session Continuity

Last session: 2026-01-22
Stopped at: Phase 5 verified and approved
Resume file: None
Next: Milestone audit - verify requirements, cross-phase integration, E2E flows
