# Project Research Summary

**Project:** CogVeri UI Refresh
**Domain:** SaaS Design System Implementation (Stripe/Notion-level polish)
**Researched:** 2026-01-21
**Confidence:** HIGH

## Executive Summary

Modern SaaS users in 2026 expect Stripe/Notion-level visual polish as baseline, not premium. This UI refresh must balance aesthetic excellence with systematic refactoring to avoid the predictable failure modes that plague visual redesign projects. The research reveals three critical insights: (1) TailwindCSS 3.4.x with CSS variables provides production-ready stability while preparing for v4 migration, (2) visual changes expose architectural debt that cannot be ignored—dual component systems and scope creep kill projects, and (3) accessibility and visual regression testing must be established BEFORE starting work, not bolted on later.

The recommended approach is foundation-first architecture: establish design tokens and testing infrastructure first, then build primitives (atoms), then composites (molecules), then patterns (organisms), and finally migrate pages incrementally with hard deadlines for legacy component deletion. This bottom-up strategy allows parallel development where new design system components coexist temporarily with legacy code, but strict enforcement prevents indefinite dual-system limbo.

Key risks center on scope creep (visual-only project expanding into feature rewrites), accessibility regressions (beautiful but unusable), and incomplete migrations (shipping both old and new systems indefinitely). Mitigation requires written scope boundaries with change control, automated accessibility testing in CI from day one, and aggressive deletion of legacy components page-by-page rather than letting them linger.

## Key Findings

### Recommended Stack

CogVeri currently uses a solid foundation: React 18.3.1, Vite 6.4.1, TailwindCSS 3.4.19 with well-structured brand colors (teal/navy/orange). The recommended approach maintains this stability while adopting 2026 best practices: CSS variables for runtime theming, OKLCH-adjacent accessible color systems, and component-based architecture with atomic design principles.

**Core technologies:**
- **TailwindCSS 3.4.x** (current: 3.4.19) — Industry standard utility-first framework. Stay on v3 for stability; v4 is beta with breaking changes. Prepare for eventual migration via CSS variables.
- **Inter Variable Font** (already implemented) — Designed for screen readability, industry standard for professional SaaS (Stripe, GitHub, Vercel). Variable font support reduces HTTP requests.
- **CSS Variables + @theme** (new adoption) — Enables runtime theming, prepares for Tailwind v4 migration, provides semantic token system. Shift from JavaScript config to CSS-first design tokens.
- **clsx + tailwind-merge** (new utilities) — Conditional className composition without conflicts. Essential for variant-based component APIs.
- **Storybook** (optional but recommended) — Component documentation and visual regression baseline. Prevents component duplication and enables design system discovery.

**Color System Approach:**
Adopt Stripe's CIELAB-inspired accessible color system with perceptually uniform scales guaranteeing WCAG 2.2 AA compliance (4.5:1 contrast for text). Keep existing teal brand identity (primary-600: #0d9488) while enhancing with semantic tokens. Use neutral grays (slate) for 90% of UI, green accent sparingly for primary actions and brand moments—creating calm, professional aesthetic.

**Typography System:**
Continue Inter via Google Fonts CDN with variable weight support (100-900). Consider self-hosting later for performance/GDPR. Conservative type scale (12px captions to 36px display headers) with clear hierarchy using font-medium (500) for buttons, font-semibold (600) for headings.

### Expected Features

Modern SaaS dashboards in 2026 have evolved beyond basic functionality—beautiful interfaces are baseline, not differentiators. 70% of SaaS churn is attributed to poor UX rather than missing features. Users expect AI integration, command palettes, real-time updates, and mobile optimization as standard.

**Must have (table stakes):**
- **5-state button pattern** — Enabled, disabled, hover, focus, pressed with 150-200ms transitions
- **Inline form validation** — Real-time feedback, not submit-time errors. Single-column forms with contextual coaching.
- **Data tables with sort/filter/pagination** — Server-side pagination for large datasets, column sorting, row selection
- **Loading states with skeleton screens** — Never show blank screens. Shimmer effect matching real content layout to prevent CLS.
- **Responsive sidebar navigation** — Collapsible to mini-drawer (icons only), 3-5 primary destinations max
- **Toast notifications** — 3-8 second display, non-intrusive edge placement for confirmations (NOT critical alerts)
- **Modal/dialog system** — Clear title, concise body (2-3 seconds to understand), one primary CTA, Escape key exit
- **Empty states** — Never show blank screens. Provide guidance on next steps, assure nothing is broken.
- **Basic charts** (bar, line, pie) — Limit charts/widgets, use whitespace, 1-2 primary colors + 1 accent
- **Real-time updates** — WebSocket integration for live data. Shifting from static reports to live feeds in 2026.
- **Mobile-first responsive** — 68% access dashboards on mobile. Performance critical: >3s load = 50% abandonment.
- **Accessibility WCAG 2.2 AA** — Color contrast 4.5:1 text / 3:1 icons, keyboard navigation, screen reader support, focus indicators

**Should have (competitive differentiators):**
- **Command palette (Cmd+K)** — Expected in modern SaaS (Notion, Figma). Keyboard-first navigation + action search.
- **AI-powered insights** — Contextual recommendations, pattern recognition, auto chart suggestions. Design for graceful AI errors.
- **Bulk actions** — Multi-select with operations. Critical for task management and video management workflows.
- **Progressive disclosure** — Break workflows into guided steps. Reveal advanced features gradually. 38% increase in feature adoption when well-implemented.
- **Dark mode** — Full theme system with proper contrast ratios, not just inverted colors. Growing expectation in 2026.
- **Keyboard shortcuts** (beyond Cmd+K) — Documented shortcut system, context-aware, increases productivity for daily users
- **Export/Share capabilities** — CSV/PDF export, shareable links, embeds. Expected for reporting dashboards.
- **Customizable dashboards** — Drag-and-drop widgets, rearrangeable layout, personalized views for power users

**Defer (v2+):**
- **Advanced data viz** (heat maps, radial charts, animations) — Basic charts sufficient initially
- **Collaborative features** (real-time multi-user) — Valuable but complex, requires usage data to design right
- **Data storytelling with sequences** — Particularly effective for executive presentations but not core workflow
- **AI-driven adaptive interfaces** — Show frequently-used tools based on behavior. Requires usage patterns first.

**CogVeri-specific critical features:**
- **Video player component** — Custom controls, timestamp comments, playback speed, frame-by-frame scrubbing
- **Timestamp-based comments** — Link feedback to specific video moments
- **Upload progress for large files** — Clear progress indication for video uploads
- **Rubric visualization** — Clear pass/fail indicators, score breakdown, AI confidence levels
- **Manual override UI** — Reviewers can adjust AI scoring
- **Magic link generation** — One-click copy, QR code for mobile contributors
- **Role-based UI** — Show/hide features based on user role (owner, admin, reviewer, member)

### Architecture Approach

The recommended architecture follows a three-layer design system hierarchy: **Foundations (design tokens) → Components (atoms → molecules → organisms) → Patterns (page templates)**. This bottom-up structure enables incremental migration where new design system components can coexist temporarily with legacy code.

**Foundation Layer:**
CSS-first design tokens using Tailwind v4's `@theme` directive pattern (even while on v3 for compatibility). Organize tokens by category (colors.css, typography.css, spacing.css, shadows.css) with semantic naming. Three-tier token system: base tokens (color primitives), semantic tokens (map to meanings like "text-primary"), component tokens (component-specific references).

**Component Layer (Atomic Design):**
- **Atoms** (Primitives): Button, Input, Badge, Icon, Avatar — Pure UI elements with no business logic
- **Molecules** (Components): FormField (Input + Label + Error), SearchBar (Input + Icon + Button), Pagination
- **Organisms** (Patterns): Header, Sidebar, Card (compound component), DataTable, Modal
- **Templates**: Page layouts (DashboardLayout, SettingsLayout, AuthLayout)
- **Pages**: Actual route implementations consuming templates and patterns

**Composition Patterns:**
1. **Compound components** for complex UI (Card, Modal, Tabs) — Parent provides context, children consume
2. **Polymorphic components** for flexibility (Button that can render as `<a>`, `<Link>`, or `<button>`)
3. **Render props/hooks** for behavior reuse (FormField with validation hooks)

**Component API Design:**
Variant-based with TypeScript. Avoid prop explosion (10+ boolean props). Use semantic variants: `<Button variant="primary" size="md" />` not `<Button isPrimary isLarge />`. Reference design tokens, never hardcoded colors.

**Migration Strategy for CogVeri:**
Current state has 22 components in `components/ui/`. Target state adds `design-system/` directory with foundations, primitives, components, patterns. Parallel implementation with backwards-compatible exports during migration. Hard deadline for legacy deletion prevents indefinite dual-system limbo.

**Major components:**
1. **Foundation Layer** — Design tokens as CSS variables, TypeScript token types, Tailwind config integration
2. **Primitive Component Library** — 15-20 atomic components (Button, Input, Badge, Card, etc.) with strict TypeScript types
3. **Composite Component Library** — 10-15 molecules (FormField, SearchBar, Pagination, Breadcrumb)
4. **Pattern Components** — 5-8 organisms (Header, Sidebar, Modal, DataTable, Card with compound API)
5. **Layout Templates** — 2-3 page layouts (Dashboard, Settings, Auth) providing consistent structure
6. **Page Migration System** — Gradual replacement of legacy components with design system equivalents

### Critical Pitfalls

Research identified 14 distinct pitfalls across critical/moderate/minor severity. Top 5 critical pitfalls that cause project failure:

1. **Running dual component systems indefinitely** — Legacy Button and new Button coexist for months. Bundle size grows, inconsistency persists, defeats entire purpose. **Prevention:** Set hard migration deadline, track migration state explicitly, ESLint rule forbidding imports from old paths, delete aggressively page-by-page.

2. **Dynamic Tailwind class names purged in production** — Styles work in dev, break in prod. String interpolation like `` `bg-${color}-500` `` gets purged by JIT compiler. **Prevention:** NEVER concatenate class names. Write complete strings in ternaries. Use safelist for legitimate dynamic needs. Test production builds locally before every PR.

3. **Scope creep through "quick wins"** — Visual-only project expands into feature rewrites. "While we're here..." becomes 9-month redesign. **Prevention:** Written scope boundary document, feature freeze enforcement, change control board for ALL changes, defer by default, communicate trade-offs explicitly.

4. **Accessibility regressions through visual changes** — New design reduces contrast ratios, breaks keyboard navigation, loses screen reader context. **Prevention:** Automated accessibility testing in CI (Lighthouse, Pa11y, axe-core), manual keyboard testing, color contrast validation during design, screen reader testing before merge.

5. **No visual regression testing** — Developer updates shared Button component. Changes cascade unexpectedly to 47 contexts. Modal footer breaks, table actions misalign, mobile view collapses. **Prevention:** Visual regression tooling (Chromatic, Percy, Playwright), Storybook for component inventory, snapshot baseline before refresh starts, block merges if visual changes unreviewed.

**Additional critical considerations:**
- **Inconsistent design token usage** — Developers use arbitrary values `text-[#1e3a5f]` instead of tokens. ESLint enforcement required.
- **Component definition inside render functions** — Performance degradation, state loss, difficult testing. Extract to module level.
- **Missing component documentation** — Developers build duplicates because they don't know existing components exist. Storybook required.
- **Bundle size creep** — CSS bundle triples with both old and new systems. Monitor every build, set performance budgets.

## Implications for Roadmap

Based on research, suggested 5-phase structure with 2-week time-boxes and clear deliverables:

### Phase 1: Foundation & Infrastructure (2 weeks)
**Rationale:** Cannot safely refresh UI without design tokens, testing infrastructure, and enforcement mechanisms. Attempting visual work without this foundation is the #1 cause of project failure.

**Delivers:**
- Design token system (`design-system/foundations/tokens/*.css`)
- CSS variables replacing hardcoded config values
- TypeScript token type definitions
- ESLint rules preventing arbitrary values and dynamic class construction
- Accessibility testing in CI (Lighthouse, Pa11y)
- Visual regression testing baseline (Storybook + Chromatic/Percy setup)
- Bundle size monitoring
- Documentation: Token naming conventions, component standards

**Addresses features:** N/A (infrastructure only)

**Avoids pitfalls:**
- Dynamic class purging (ESLint rule catches template literals)
- Accessibility regressions (CI catches before merge)
- No visual regression testing (infrastructure established)
- Inconsistent token usage (ESLint enforcement)

**Research flag:** Skip research — established patterns, infrastructure setup

---

### Phase 2: Primitive Components (2-3 weeks)
**Rationale:** Build atomic design system components that become building blocks for everything else. Start with most-used components (Button, Input, Card) to maximize reuse.

**Delivers:**
- `design-system/primitives/` directory with 8-10 atomic components
- Button component (5 states: enabled, disabled, hover, focus, pressed)
- Form inputs (text, select, checkbox) with inline validation
- Card component with variant system
- Badge, Icon, Avatar components
- Loading states (spinner, progress)
- TypeScript strict types for all components
- Storybook documentation for each component
- Component test coverage >80%

**Addresses features:**
- 5-state button pattern (table stakes)
- Inline form validation (table stakes)
- Consistent card styling (table stakes)
- Loading states (table stakes)

**Avoids pitfalls:**
- Premature abstraction (start with 2-3 real use cases, then abstract)
- Prop explosion (variant-based API with named variants)
- Component inside render functions (ESLint catches)
- Missing documentation (Storybook required for "done")

**Research flag:** Skip research — atomic component patterns well-documented

---

### Phase 3: Composite Components & Feedback System (2 weeks)
**Rationale:** Build molecule-level components that compose primitives. Establish feedback patterns (toasts, modals, alerts) used throughout application.

**Delivers:**
- `design-system/components/` directory with 5-8 composites
- FormField (Input + Label + Error with validation hooks)
- SearchBar (Input + Icon + Button)
- Pagination component
- Toast notification system (3-8 second display, non-intrusive)
- Modal/dialog system (compound component pattern)
- Alert/banner component
- Empty state component
- Dropdown component (searchable for 7-15+ options)

**Addresses features:**
- Toast notifications (table stakes)
- Modal/dialog system (table stakes)
- Empty states (table stakes)
- Form validation system (table stakes)

**Avoids pitfalls:**
- No hardcoded values (all reference design tokens)
- Component boundaries clear (FormField doesn't try to be everything)
- Documented in Storybook (prevents duplication)

**Research flag:** Skip research — feedback patterns well-established (Material UI, Carbon Design, Stripe docs)

---

### Phase 4: Pattern Components & Data Display (2-3 weeks)
**Rationale:** Build organism-level patterns and data display components. Data table is complex dependency requiring primitives, loading states, empty states, pagination.

**Delivers:**
- `design-system/patterns/` directory with 4-6 organisms
- Data table with sort, filter, pagination, row selection (TanStack Table or Material React Table)
- Card pattern with compound API (Card.Header, Card.Body, Card.Footer)
- Sidebar navigation (responsive, collapsible to mini-drawer)
- Breadcrumb navigation
- Icon system (single consistent set, Heroicons or similar)
- Layout templates (DashboardLayout, SettingsLayout)
- Basic charts (bar, line, pie with 1-2 colors + accent)

**Addresses features:**
- Data tables with sort/filter/pagination (table stakes)
- Responsive sidebar navigation (table stakes)
- Breadcrumb navigation (table stakes)
- Basic charts (table stakes)
- Consistent icon system (table stakes)

**Avoids pitfalls:**
- Mixing multiple UI libraries (policy: ONE icon library, stick with it)
- Over-engineering too early (allow duplication, abstract after 3+ patterns)
- Bundle size creep (monitor every build, reject new UI dependencies)

**Research flag:** Needs light research for data table library selection (TanStack vs Material React Table trade-offs)

---

### Phase 5: Page Migration & Legacy Cleanup (3-4 weeks)
**Rationale:** Migrate existing pages to use design system components. Delete legacy components aggressively to prevent indefinite dual-system state.

**Delivers:**
- All pages using design system components
- Legacy component deletion (NO dual system shipping)
- Performance validation (bundle size ≤ baseline + 5%)
- Accessibility validation (Lighthouse score unchanged or improved)
- Visual regression testing for all migrated pages
- Design system usage documentation
- Migration guide for future pages

**Migration priority:**
1. New features (100% design system, no legacy)
2. Low-traffic pages (quick wins, lower risk)
3. High-traffic pages (gradual rollout with feature flags)
4. Complex pages (last, most time-intensive)

**Addresses features:**
- Mobile-first responsive (table stakes) — test all migrations on mobile devices
- Real-time updates (table stakes) — maintain WebSocket integration during migration
- Accessibility WCAG 2.2 AA (table stakes) — automated testing prevents regressions

**Avoids pitfalls:**
- Dual component systems indefinitely (HARD DEADLINE for legacy deletion)
- Scope creep (VISUAL ONLY — no feature changes during migration)
- Visual regressions (snapshot testing before/after every page)
- Accessibility regressions (CI blocks merges failing accessibility tests)

**Research flag:** Skip research — page migration is systematic refactoring, not novel technical challenge

---

### Phase 6: Polish & Differentiators (Defer to post-MVP evaluation)
**Rationale:** Command palette, dark mode, and AI features are differentiators but not table stakes. Validate core refresh success before investing in these.

**Potential features:**
- Command palette (Cmd+K) — keyboard-first navigation + action search
- Dark mode — full theme system with semantic tokens
- Bulk actions — multi-select for task/video management
- Progressive disclosure — guided workflows, gradual feature reveal
- Export/Share capabilities — CSV/PDF export, shareable links

**Decision point:** Evaluate after Phase 5 completion based on:
- User feedback on refreshed UI
- Technical performance (bundle size, load times)
- Development velocity (did we stay on schedule?)
- Business priorities (what unlocks revenue/retention?)

---

### Phase Ordering Rationale

**Why foundation-first:** Visual changes expose architectural debt. Cannot refresh UI without addressing design tokens, testing infrastructure, and component boundaries. Projects that skip this predictably fail.

**Why atomic design bottom-up:** Primitives (atoms) are building blocks for composites (molecules), which compose into patterns (organisms). Building top-down creates brittle abstractions that don't fit actual use cases.

**Why hard deadlines for legacy deletion:** Dual component systems persist indefinitely without forcing functions. Setting completion dates and blocking legacy imports forces discipline. "80% done" syndrome is fatal.

**Why defer differentiators:** Command palette, dark mode, AI features are valuable but not table stakes. Validate core refresh succeeds before expanding scope. Prevents scope creep and allows data-driven decisions post-launch.

**Dependency chain:**
- Phase 2 (primitives) depends on Phase 1 (tokens, testing)
- Phase 3 (composites) depends on Phase 2 (atoms to compose)
- Phase 4 (patterns) depends on Phase 2 + 3 (components to orchestrate)
- Phase 5 (migration) depends on Phase 1-4 (complete design system)

**Risk mitigation through phasing:**
- 2-week time-boxes prevent "never-ending" syndrome
- Hard deliverables for each phase (cannot skip ahead)
- Testing infrastructure established BEFORE visual work begins
- Scope freeze enforced throughout (change control board)
- Aggressive deletion prevents dual-system limbo

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 4 (Data Display):** Data table library selection needs evaluation. TanStack Table vs Material React Table trade-offs for CogVeri's use case (server-side pagination, video metadata display, bulk operations). Research can be quick (1-2 hours comparing APIs).

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Design token systems are well-documented. TailwindCSS v4 `@theme` approach has official docs. CSS variables pattern established.
- **Phase 2 (Primitives):** Atomic component patterns mature. Button, Input, Card have established best practices across Material UI, Carbon Design, Stripe docs.
- **Phase 3 (Composites):** Feedback patterns (toast, modal, alert) have industry consensus. Compound component pattern well-documented.
- **Phase 5 (Migration):** Page migration is systematic refactoring work, not novel technical challenge. Process is execution, not discovery.

**CogVeri-specific research (post-refresh, separate from UI refresh scope):**
- Video player component patterns (timestamp comments, frame-by-frame, playback controls)
- Rubric visualization for AI analysis results
- Magic link generation UI/UX patterns
- These are feature work, not visual refresh work. Defer to separate project to avoid scope creep.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | TailwindCSS 3.4.x stability verified via official docs. Inter font industry standard with widespread adoption (Stripe, GitHub, Vercel). CSS variables + @theme pattern documented for v4 migration path. |
| **Features** | HIGH | Table stakes vs differentiators validated across multiple 2026 sources (Stripe docs, Carbon Design, Material UI, Nielsen Norman Group). 70% churn from UX stat cited in multiple SaaS research articles. WCAG 2.2 AA requirements official standard for 2026. |
| **Architecture** | HIGH | Atomic design methodology established (Brad Frost). Compound component patterns documented (Kent C. Dodds, Patterns.dev). Three-layer design system hierarchy validated across design system resources (UXPin, Backlight, Sparkbox). |
| **Pitfalls** | HIGH | UI refresh failure patterns well-documented across 2025-2026 sources. Tailwind purging issues verified in official docs + troubleshooting guides. Scope creep patterns cross-referenced across multiple project management sources. React anti-patterns validated in 2026 best practice guides. |

**Overall confidence:** HIGH

Research draws from authoritative sources (official Tailwind docs, WCAG standards, established design system methodologies) combined with current 2026 industry practices. Architecture patterns are mature and proven. Pitfalls are predictable based on documented failure modes.

### Gaps to Address

**Minimal gaps — most decisions can be made confidently based on research:**

1. **Data table library selection (Phase 4):** TanStack Table vs Material React Table trade-off needs quick evaluation for CogVeri's specific use case. Both are production-ready; decision is preference + API fit. **Handling:** 1-2 hour spike during Phase 4 planning to compare APIs and bundle size.

2. **Video player component patterns (future):** CogVeri-specific features like timestamp comments and frame-by-frame scrubbing are domain-specific. Research needed when building video player, but this is SEPARATE from UI refresh scope. **Handling:** Flag as future research topic, do not allow scope creep into current refresh.

3. **Visual regression tool selection:** Chromatic vs Percy vs Argos vs Playwright visual testing needs evaluation for CogVeri's monorepo structure and budget. All are proven tools; decision is cost + workflow fit. **Handling:** Quick spike during Phase 1 (30-60 minutes comparing pricing and Vite integration).

4. **Storybook adoption decision:** Optional but recommended. Team decision based on documentation value vs setup cost. **Handling:** Discuss during Phase 1 planning. Can defer if timeline tight, but component documentation becomes critical gap.

**No research blockers identified.** UI refresh domain is mature with established patterns. Execution risk is higher than discovery risk—discipline and systematic process matter more than novel technical solutions.

## Sources

### Primary (HIGH confidence)

**TailwindCSS & Design Tokens:**
- [Tailwind CSS Theme Configuration (Official)](https://tailwindcss.com/docs/theme)
- [Tailwind CSS v4 Release Notes (Official)](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS Best Practices 2025-2026: Design Tokens, Typography & Responsive Patterns](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns)
- [Tailwind CSS 4 @theme: The Future of Design Tokens](https://medium.com/@sureshdotariya/tailwind-css-4-theme-the-future-of-design-tokens-at-2025-guide-48305a26af06)

**Color Systems & Accessibility:**
- [Stripe: Designing Accessible Color Systems](https://stripe.com/blog/accessible-color-systems)
- [2026 WCAG & ADA Website Compliance Requirements](https://www.accessibility.works/blog/wcag-ada-website-compliance-standards-requirements/)
- [@tailwindcss/typography Plugin (Official)](https://github.com/tailwindlabs/tailwindcss-typography)

**Design Systems & Component Architecture:**
- [Stripe Dashboard Design System](https://docs.stripe.com/stripe-apps/design)
- [Carbon Design System](https://carbondesignsystem.com/)
- [Material UI Components](https://mui.com/material-ui/)
- [Atomic Design Methodology - Brad Frost](https://atomicdesign.bradfrost.com/chapter-2/)
- [React Design System – Where to Start? - UXPin](https://www.uxpin.com/studio/blog/react-design-system/)

**Component Composition Patterns:**
- [Compound Pattern - Patterns.dev](https://www.patterns.dev/react/compound-pattern/)
- [React Hooks: Compound Components - Kent C. Dodds](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- [Polymorphic Components with React and TypeScript - LogRocket](https://blog.logrocket.com/build-strongly-typed-polymorphic-components-react-typescript/)

**Visual Regression Testing:**
- [Visual Regression Testing for React with Chromatic](https://oneuptime.com/blog/post/2026-01-15-visual-regression-testing-react-chromatic/view)
- [Scaling Visual Regression Testing - Argos + MUI Case Study](https://argos-ci.com/customers/mui)

### Secondary (MEDIUM confidence)

**SaaS UI Best Practices:**
- [Top 12 SaaS Design Trends 2026](https://www.designstudiouiux.com/blog/top-saas-design-trends/)
- [SaaS Dashboard UX: Trends, Guidelines, & Fundamentals](https://arounda.agency/blog/saas-dashboard-ux-trends-guidelines-and-fundamentals)
- [SaaS UI/UX Best Practices 2026](https://www.krishaweb.com/blog/saas-ui-ux-best-practices-high-volume-conversions/)

**Component-Specific Patterns:**
- [Button States: Communicate Interaction - Nielsen Norman Group](https://www.nngroup.com/articles/button-states-communicate-interaction/)
- [Modal UX Design for SaaS 2025-2026](https://userpilot.com/blog/modal-ux-design/)
- [Toast Notifications Best Practices - LogRocket](https://blog.logrocket.com/ux-design/toast-notifications/)
- [Skeleton Screens 101 - Nielsen Norman Group](https://www.nngroup.com/articles/skeleton-screens/)
- [Empty State Interface Design - Nielsen Norman Group](https://www.nngroup.com/articles/empty-state-interface-design/)

**Pitfalls & Anti-Patterns:**
- [Fixing Missing Styles in Tailwind CSS Due to Purging Issues](https://www.mindfulchase.com/explore/troubleshooting-tips/fixing-missing-styles-in-tailwind-css-due-to-purging-issues.html)
- [Understanding Tailwind CSS Safelist](https://franklam.hashnode.dev/understanding-tailwind-css-safelist-and-how-it-solves-purging-issues)
- [Scope Creep in Project Management: Examples and Prevention](https://monday.com/blog/project-management/keep-scope-creep-undermining-project/)
- [6 Common React Anti-Patterns Hurting Your Code Quality](https://itnext.io/6-common-react-anti-patterns-that-are-hurting-your-code-quality-904b9c32e933)
- [Automating Accessibility Testing in 2026](https://www.browserstack.com/guide/automate-accessibility-testing)

**Migration & Scalability:**
- [Incremental Migration Approaches for Legacy Applications](https://circleci.com/blog/incremental-migration-approaches-for-legacy-applications/)
- [Building a Scalable Frontend Monorepo with Turborepo, Vite, TailwindCSS V4](https://dev.to/harrytranswe/building-a-scalable-frontend-monorepo-with-turborepo-vite-tailwindcss-v4-react-19-tanstack-21ko)

### Tertiary (LOW confidence - validated against multiple sources)

**Typography & Fonts:**
- [10 Trending Fonts for SaaS Websites in 2025](https://medium.com/@mypippa.studio/10-trending-fonts-for-saas-websites-in-2025-for-ui-ux-design-a8860171721d)
- [Modern Font Stacks](https://modernfontstacks.com/)

**Color Trends:**
- [Best 30 SaaS UI Design Color Palettes](https://octet.design/colors/user-interfaces/saas-ui-design/)
- [Top 2026 Web Design Color Trends](https://www.loungelizard.com/blog/web-design-color-trends/)

---

**Research completed:** 2026-01-21
**Ready for roadmap:** Yes

**Next steps:**
1. Orchestrator proceeds to requirements definition phase
2. Use phase suggestions as starting point for roadmap structure
3. Apply research flags to determine which phases need deeper research
4. Reference pitfalls during planning to establish preventive measures
