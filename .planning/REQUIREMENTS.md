# Requirements: CogVeri UI Refresh

## Overview

Requirements for comprehensive UI/UX overhaul creating Stripe/Notion-level polish with unified component styling and green accent branding.

## Requirements by Category

### Foundation & Infrastructure (FND)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FND-01 | Design tokens system (colors, spacing, typography, shadows as CSS variables) | v1 | 1 |
| FND-02 | ESLint rules preventing arbitrary values and dynamic class construction | v1 | 1 |
| FND-03 | Accessibility testing in CI (Lighthouse, Pa11y) | v1 | 1 |
| FND-04 | Visual regression testing baseline (Playwright screenshots) | v1 | 1 |
| FND-05 | Bundle size monitoring | v1 | 1 |

### Primitive Components (PRIM)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| PRIM-01 | Button component (5 states: enabled, disabled, hover, focus, pressed) | v1 | 2 |
| PRIM-02 | Form inputs (text, select, checkbox) with inline validation | v1 | 2 |
| PRIM-03 | Card component with variant system | v1 | 2 |
| PRIM-04 | Badge, Icon, Avatar components | v1 | 2 |
| PRIM-05 | Loading states (spinner, progress, skeleton screens) | v1 | 2 |
| PRIM-06 | Storybook documentation for each component | v1 | 2 |

### Composite Components & Feedback (COMP)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| COMP-01 | Toast notification system (3-8 second display) | v1 | 3 |
| COMP-02 | Modal/dialog system (compound component pattern) | v1 | 3 |
| COMP-03 | FormField (Input + Label + Error with validation hooks) | v1 | 3 |
| COMP-04 | Empty state component | v1 | 3 |
| COMP-05 | Dropdown component (searchable) | v1 | 3 |
| COMP-06 | Alert/banner component | v1 | 3 |

### Pattern Components & Data Display (PATT)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| PATT-01 | Data table with sort, filter, pagination (TanStack Table or MRT) | v1 | 4 |
| PATT-02 | Responsive sidebar navigation (collapsible to mini-drawer) | v1 | 4 |
| PATT-03 | Breadcrumb navigation | v1 | 4 |
| PATT-04 | Icon system (single consistent set) | v1 | 4 |
| PATT-05 | Layout templates (DashboardLayout, SettingsLayout) | v1 | 4 |
| PATT-06 | Basic charts (bar, line, pie) | v1 | 4 |

### Page Migration (PAGE)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| PAGE-01 | Dashboard/home page redesign | v1 | 5 |
| PAGE-02 | Task management pages visual refresh | v1 | 5 |
| PAGE-03 | Recording/playback UI polish | v1 | 5 |
| PAGE-04 | Settings/admin pages alignment | v1 | 5 |
| PAGE-05 | Link audit and routing fixes | v1 | 5 |
| PAGE-06 | Legacy component deletion (NO dual system shipping) | v1 | 5 |

## Deferred (v2)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| DEF-01 | Command palette (Cmd+K) | Differentiator, not table stakes |
| DEF-02 | Dark mode | Requires semantic token validation first |
| DEF-03 | Bulk actions | Feature work beyond visual refresh |
| DEF-04 | Progressive disclosure | Requires usage data to design right |
| DEF-05 | Export/Share capabilities | Feature work beyond visual refresh |
| DEF-06 | Keyboard shortcuts beyond basics | After command palette |
| DEF-07 | Customizable dashboards | After product-market fit |

## Out of Scope

- Video player enhancements (separate project)
- Timestamp comments enhancement (separate project)
- Rubric visualization changes (separate project)
- Magic link UI enhancements (separate project)
- New features or functionality
- Backend API changes
- Mobile app

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| FND-05 | Phase 1 | Complete |
| PRIM-01 | Phase 2 | Complete |
| PRIM-02 | Phase 2 | Complete |
| PRIM-03 | Phase 2 | Complete |
| PRIM-04 | Phase 2 | Complete |
| PRIM-05 | Phase 2 | Complete |
| PRIM-06 | Phase 2 | Complete |
| COMP-01 | Phase 3 | Complete |
| COMP-02 | Phase 3 | Complete |
| COMP-03 | Phase 3 | Complete |
| COMP-04 | Phase 3 | Complete |
| COMP-05 | Phase 3 | Complete |
| COMP-06 | Phase 3 | Complete |
| PATT-01 | Phase 4 | Complete |
| PATT-02 | Phase 4 | Complete |
| PATT-03 | Phase 4 | Complete |
| PATT-04 | Phase 4 | Complete |
| PATT-05 | Phase 4 | Complete |
| PATT-06 | Phase 4 | Complete |
| PAGE-01 | Phase 5 | Complete |
| PAGE-02 | Phase 5 | Complete |
| PAGE-03 | Phase 5 | Complete |
| PAGE-04 | Phase 5 | Complete |
| PAGE-05 | Phase 5 | Complete |
| PAGE-06 | Phase 5 | Complete |

**Coverage:** 29/29 v1 requirements mapped

---
*Last updated: 2026-01-22*
