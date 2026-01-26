# Roadmap: CogVeri UI Refresh

## Overview

Transform CogVeri from visually inconsistent pages into a unified, Stripe/Notion-level polished experience. The journey follows atomic design principles: establish design tokens and testing infrastructure first, then build primitives (atoms), composites (molecules), patterns (organisms), and finally migrate all pages with aggressive legacy deletion. Foundation-first approach prevents the predictable failure modes of UI refresh projects.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Infrastructure** - Design tokens, testing infrastructure, enforcement mechanisms
- [x] **Phase 2: Primitive Components** - Atomic building blocks (Button, Input, Card, Badge, Loading states)
- [x] **Phase 3: Composite Components & Feedback** - Molecules that compose primitives (Toast, Modal, FormField, Dropdown)
- [x] **Phase 4: Pattern Components & Data Display** - Organisms and layout (DataTable, Sidebar, Charts, Templates)
- [x] **Phase 5: Page Migration & Legacy Cleanup** - Migrate all pages, delete legacy components, validate performance

## Phase Details

### Phase 1: Foundation & Infrastructure
**Goal**: Establish design system foundations and testing infrastructure that prevent common UI refresh failures
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05
**Plans**: 3 plans

**Success Criteria** (what must be TRUE):
  1. Design tokens (colors, spacing, typography, shadows) exist as CSS variables and are consumed by Tailwind config
  2. ESLint rules prevent arbitrary color values (`text-[#...]`) and dynamic class construction (`bg-${color}-500`)
  3. Accessibility tests run in CI and block PRs with WCAG violations
  4. Visual regression baseline exists with Playwright screenshots for current pages
  5. Bundle size monitoring alerts on increases >5% from baseline

**Pitfalls to Avoid:**
- Pitfall 2: Dynamic Tailwind class names purged in production (ESLint rule catches template literals)
- Pitfall 4: Accessibility regressions (CI catches before merge)
- Pitfall 5: No visual regression testing (infrastructure established)
- Pitfall 6: Inconsistent design token usage (ESLint enforcement)

Plans:
- [x] 01-01-PLAN.md - Design tokens and Tailwind configuration (Wave 1)
- [x] 01-02-PLAN.md - ESLint rules and enforcement (Wave 1)
- [x] 01-03-PLAN.md - Testing infrastructure: accessibility, visual regression, bundle monitoring (Wave 2)

---

### Phase 2: Primitive Components
**Goal**: Build atomic design system components that become building blocks for all UI
**Depends on**: Phase 1
**Requirements**: PRIM-01, PRIM-02, PRIM-03, PRIM-04, PRIM-05, PRIM-06
**Plans**: 3 plans

**Success Criteria** (what must be TRUE):
  1. Button component renders all 5 states (enabled, disabled, hover, focus, pressed) with correct transitions (150-200ms)
  2. Form inputs (text, select, checkbox) display inline validation errors without page reload
  3. Card component supports at least 3 variants (default, elevated, outlined) via variant prop
  4. Badge, Icon, and Avatar components exist with TypeScript-enforced props
  5. Loading states (spinner, progress bar, skeleton) are documented in Storybook with usage examples

**Pitfalls to Avoid:**
- Pitfall 12: Over-engineering abstractions too early (start with 2-3 real use cases, then abstract)
- Pitfall 7: Component definition inside render functions (ESLint catches)
- Pitfall 9: Missing component documentation (Storybook required for "done")

Plans:
- [x] 02-01-PLAN.md - Button and form inputs with CVA variants (Wave 1)
- [x] 02-02-PLAN.md - Card, Badge, Icon, Avatar components (Wave 1)
- [x] 02-03-PLAN.md - Loading states and Storybook documentation (Wave 2)

---

### Phase 3: Composite Components & Feedback
**Goal**: Build molecule-level components that compose primitives and establish feedback patterns
**Depends on**: Phase 2
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06
**Plans**: 3 plans

**Success Criteria** (what must be TRUE):
  1. Toast notifications display for 3-8 seconds and stack properly when multiple are triggered
  2. Modal/dialog can be opened, closed via Escape key, and traps focus within while open
  3. FormField component combines Input + Label + Error with validation hooks that auto-display errors
  4. Empty state component displays actionable guidance (never blank screens)
  5. Dropdown supports search/filter for lists with 7+ options

**Pitfalls to Avoid:**
- Pitfall 6: No hardcoded color values (all reference design tokens)
- Pitfall 9: Missing documentation (all composites documented in Storybook)

Plans:
- [x] 03-01-PLAN.md - Toast notification wrapper and Alert/Banner component (Wave 1)
- [x] 03-02-PLAN.md - Modal/Dialog with Radix and compound component pattern (Wave 1)
- [x] 03-03-PLAN.md - FormField, searchable Dropdown, and EmptyState enhancement (Wave 2)

---

### Phase 4: Pattern Components & Data Display
**Goal**: Build organism-level patterns and data display components that power major pages
**Depends on**: Phase 3
**Requirements**: PATT-01, PATT-02, PATT-03, PATT-04, PATT-05, PATT-06
**Plans**: 3 plans

**Success Criteria** (what must be TRUE):
  1. Data table supports column sorting, row filtering, and pagination (server-side ready)
  2. Sidebar navigation collapses to mini-drawer (icons only) and expands on demand
  3. Breadcrumb navigation renders current page hierarchy with clickable ancestors
  4. Single icon system is used throughout (no mixed icon libraries)
  5. DashboardLayout and SettingsLayout templates provide consistent page structure
  6. Basic charts (bar, line, pie) render with 1-2 primary colors + accent color

**Pitfalls to Avoid:**
- Pitfall 8: Mixing multiple UI libraries (ONE icon library, stick with it)
- Pitfall 10: Bundle size creep (monitor every build, reject new UI dependencies)
- Pitfall 12: Over-engineering (allow duplication, abstract after 3+ patterns)

**Research Complete:** TanStack Table v8 selected over Material React Table (10-15kb vs 217kb bundle size). See 04-RESEARCH.md.

Plans:
- [x] 04-01-PLAN.md - DataTable with TanStack Table (sorting, pagination, server-side ready) (Wave 1)
- [x] 04-02-PLAN.md - Breadcrumbs navigation and icon system audit (Wave 1)
- [x] 04-03-PLAN.md - Layout templates (DashboardLayout, SettingsLayout) and Charts (Wave 2)

**Note:** Requirement PATT-02 (Sidebar navigation) already satisfied by existing Sidebar.tsx with collapsible mini-drawer pattern.

---

### Phase 5: Page Migration & Legacy Cleanup
**Goal**: Migrate all pages to design system and delete legacy components with no dual system shipping
**Depends on**: Phase 4
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06
**Plans**: 8 plans (4 original + 4 gap closure)

**Success Criteria** (what must be TRUE):
  1. Dashboard page uses only design system components (no legacy imports)
  2. Task management pages (list, detail, create) use only design system components
  3. Recording/playback pages use only design system components
  4. Settings/admin pages use only design system components
  5. All internal links work (no 404s from link audit)
  6. Legacy `components/ui/` directory is deleted or contains only design-system re-exports
  7. Bundle size is within baseline + 5% (no CSS/JS bloat from dual systems)
  8. Lighthouse accessibility score is unchanged or improved from baseline

**Pitfalls to Avoid:**
- Pitfall 1: Running dual component systems indefinitely (HARD DEADLINE for legacy deletion)
- Pitfall 3: Scope creep (VISUAL ONLY - no feature changes during migration)
- Pitfall 4: Accessibility regressions (CI blocks merges failing accessibility tests)
- Pitfall 5: Visual regressions (snapshot testing before/after every page)

**Migration Priority:**
1. Dashboard (high visibility, sets pattern)
2. Task pages (core workflow)
3. Recording pages (moderate complexity)
4. Settings pages (lower traffic, cleanup)

**Research Complete:** Page inventory analyzed - 20 pages in migration scope, 15 out of scope (domain-specific). See 05-RESEARCH.md.

**Verification Gap Analysis:** Button.tsx and Card.tsx ARE design system components (CVA + design tokens). Only LoadingSpinner needs replacement with FullScreenLoader for fullScreen cases.

Plans:
- [x] 05-01-PLAN.md - Dashboard, TaskDetail, and Recordings pages migration (Wave 1)
- [x] 05-02-PLAN.md - Tasks list and Reviews pages migration (Wave 1)
- [x] 05-03-PLAN.md - Settings, Auth, and Admin pages migration (Wave 2)
- [x] 05-04-PLAN.md - Link audit, legacy deletion, and final validation (Wave 3)

Gap Closure Plans:
- [x] 05-05-PLAN.md - Create FullScreenLoader component (Wave 1) [GAP CLOSURE]
- [x] 05-06-PLAN.md - Migrate auth pages to design system Spinner (Wave 2) [GAP CLOSURE]
- [x] 05-07-PLAN.md - Migrate fullScreen LoadingSpinner usages to FullScreenLoader (Wave 2) [GAP CLOSURE]
- [x] 05-08-PLAN.md - Correct barrel export categorization and Button loading state (Wave 3) [GAP CLOSURE]

---

## Key Pitfall References

This project references pitfalls from `.planning/research/PITFALLS.md`:

| Pitfall | Description | Addressed In |
|---------|-------------|--------------|
| 1 | Dual component systems indefinitely | Phase 5 (hard deletion deadline) |
| 2 | Dynamic Tailwind class purging | Phase 1 (ESLint rule) |
| 3 | Scope creep through "quick wins" | All phases (visual-only enforcement) |
| 4 | Accessibility regressions | Phase 1 (CI testing) |
| 5 | No visual regression testing | Phase 1 (Playwright baseline) |
| 6 | Inconsistent design token usage | Phase 1 (ESLint enforcement) |
| 7 | Component inside render functions | Phase 2+ (ESLint rule) |
| 8 | Mixing multiple UI libraries | Phase 4 (single icon library policy) |
| 9 | Missing component documentation | Phase 2+ (Storybook required) |
| 10 | Bundle size creep | Phase 1 (monitoring), Phase 5 (validation) |
| 12 | Over-engineering too early | Phase 2-4 (allow duplication first) |

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Infrastructure | 3/3 | Complete | 2026-01-21 |
| 2. Primitive Components | 3/3 | Complete | 2026-01-21 |
| 3. Composite Components & Feedback | 3/3 | Complete | 2026-01-21 |
| 4. Pattern Components & Data Display | 3/3 | Complete | 2026-01-22 |
| 5. Page Migration & Legacy Cleanup | 8/8 | Complete | 2026-01-22 |

**Total:** 20/20 plans complete

---
*Last updated: 2026-01-22*
