# Domain Pitfalls: UI Refresh Projects

**Domain:** Visual redesign and UI refresh for existing SaaS applications
**Researched:** 2026-01-21
**Confidence:** MEDIUM-HIGH (WebSearch verified with multiple sources, industry patterns documented)

## Executive Summary

UI refresh projects fail predictably. Despite intentions to unify design, teams ship inconsistent interfaces. Despite "visual-only" scope, teams break functionality. Despite cleanup goals, CSS bloats further. The root cause is always the same: treating visual refresh as cosmetic work rather than systematic refactoring.

**Critical insight:** Visual changes expose architectural debt. You cannot refresh UI without addressing component boundaries, state management, and styling architecture. Projects that skip this fail.

## Critical Pitfalls

Mistakes that cause rewrites, significant delays, or project abandonment.

### Pitfall 1: Running Dual Component Systems Indefinitely

**What goes wrong:**
Teams migrate components incrementally (sensible) but never complete the migration (fatal). Legacy Button and new Button coexist for months. Developers can't remember which to use. Pages mix both. Design system "completion" keeps getting pushed back.

**Why it happens:**
- No forcing function to complete migration
- "Just 80% done" syndrome - last 20% feels non-critical
- No clear boundary between old and new systems
- Migration tracking is manual, incomplete
- Feature pressure outweighs cleanup pressure

**Consequences:**
- Bundle size grows (shipping both systems)
- Inconsistency persists (defeats entire purpose of refresh)
- Technical debt compounds (harder to track which components to remove)
- Developer confusion (which Button should I use?)
- Regression risk increases (changes to legacy system still needed)

**Prevention:**
1. **Set hard migration deadline** - "All legacy components deleted by [date]"
2. **Track migration state explicitly** - Automated inventory of which components remain
3. **Prevent new legacy usage** - ESLint rule forbidding imports from old paths
4. **Delete aggressively** - Remove legacy components page-by-page, not component-by-component
5. **Make dual state painful** - No shared utilities, force duplication to create pressure to finish

**Detection:**
- Bundle analysis shows duplicate component code
- Import statements reference both `/components/old/` and `/components/ui/`
- Tailwind config has color tokens and legacy hex values
- Developers ask "which Button should I use?" in code review
- Migration tracking shows >30 days since last component removal

**Phase to address:**
- Phase 1: Establish migration policy and tracking BEFORE starting
- Phase 2: Delete legacy system completely before moving to next major area
- Throughout: Automated alerts when legacy imports detected

**Sources:**
- [Incremental Migration Approaches for Legacy Applications](https://circleci.com/blog/incremental-migration-approaches-for-legacy-applications/)
- [Incremental Modernization vs. Rip-and-Replace](https://www.in-com.com/blog/incremental-modernization-vs-rip-and-replace-a-strategic-blueprint-for-enterprise-systems/)

---

### Pitfall 2: Dynamic Tailwind Class Names Purged in Production

**What goes wrong:**
Styles work perfectly in development. Production build removes them. Users see broken layouts, missing colors, invisible buttons. The culprit: dynamically constructed class names like `` `bg-${color}-500` `` that Tailwind's JIT compiler cannot detect.

**Why it happens:**
- Developers use string interpolation for variant styling
- Conditional classes built with ternaries using partial class names
- Class names stored in database or config (user-customizable colors)
- Misunderstanding of how Tailwind's content scanning works
- No production build testing before deployment

**Consequences:**
- Broken UI in production (works in dev, fails in prod)
- Emergency rollbacks during business hours
- Loss of user trust (looks "buggy")
- Time wasted debugging why styles disappeared
- Workarounds create more technical debt (inline styles, !important hacks)

**Prevention:**
1. **NEVER concatenate class names** - Write complete strings: `color === 'blue' ? 'bg-blue-500' : 'bg-red-500'`
2. **Use safelist for dynamic patterns** - Add to tailwind.config.js for legitimate dynamic needs
3. **Validate content paths** - Ensure all .tsx files scanned: `'./src/**/*.{js,ts,jsx,tsx}'`
4. **Test production builds locally** - `npm run build && npm run preview` before every PR
5. **Use object mapping for variants** - Create lookup objects with complete class strings

**Detection:**
- Styles missing only in `npm run build` output
- Console errors about missing CSS in production preview
- Grep for template literals containing 'bg-', 'text-', 'border-'
- Review code for string interpolation in className props
- Check for dynamic class construction in utility functions

**Phase to address:**
- Phase 0 (Pre-work): Document pattern, add ESLint rule detecting string interpolation in classNames
- Phase 1: Audit existing components for violations before starting refresh
- Throughout: Production build testing in CI/CD pipeline

**Sources:**
- [Fixing Missing Styles in Tailwind CSS Due to Purging Issues](https://www.mindfulchase.com/explore/troubleshooting-tips/fixing-missing-styles-in-tailwind-css-due-to-purging-issues.html)
- [Troubleshooting Tailwind CSS Class Purging in Production Builds](https://www.mindfulchase.com/explore/troubleshooting-tips/front-end-frameworks/troubleshooting-tailwind-css-class-purging-in-production-builds.html)
- [Understanding Tailwind CSS Safelist and How It Solves Purging Issues](https://franklam.hashnode.dev/understanding-tailwind-css-safelist-and-how-it-solves-purging-issues)

---

### Pitfall 3: Scope Creep Through "Quick Wins"

**What goes wrong:**
Project starts as "visual refresh only." Designer notices confusing workflow. Product suggests "while we're here..." Developer sees opportunity to refactor state management. Six weeks later, you're rewriting features and missing deadlines.

**Why it happens:**
- No formal change control process for "visual only" project
- Assumption that small changes don't count as scope change
- Stakeholders don't understand refresh vs. redesign distinction
- UI changes expose functional problems (which feel urgent to fix)
- "It's just one more thing" mentality

**Consequences:**
- 3-month refresh becomes 9-month redesign
- Budget overruns (not scoped for feature work)
- Testing burden explodes (functional changes need full QA)
- Risk increases (changing features = changing behavior)
- Original goal (consistency) gets deprioritized for new features
- Team burnout from never-ending project

**Prevention:**
1. **Written scope boundary** - "Visual changes only. No workflow, no feature logic, no new capabilities."
2. **Feature freeze enforcement** - Separate backlog for "improvements discovered during refresh"
3. **Change control board** - ALL changes require written justification: "Why can't this wait until after refresh?"
4. **Track scope separately** - "Refresh work" vs "Opportunistic improvements" in separate columns
5. **Communicate trade-offs** - "Adding this feature delays refresh completion by X weeks"
6. **Defer by default** - When in doubt, create ticket for post-refresh work

**Detection:**
- Pull requests with both visual changes AND logic changes
- "While I was here..." statements in code review
- Timeline slipping without clear cause
- Test cases expanding beyond "visual regression" into behavior testing
- Stakeholders asking about "that feature we discussed during refresh"

**Phase to address:**
- Phase 0: Define scope boundary document and change control process
- All phases: Weekly scope review meeting - what got added, why, what's the impact?
- Post-project: Scope creep post-mortem to improve next time

**Sources:**
- [Top 7 Causes of Scope Creep and How to Prevent It in IT Projects](https://scopestack.io/blog/top-7-causes-of-scope-creep-and-how-to-prevent-it-in-it-projects)
- [Scope creep in project management: Examples, warning signs, and how to prevent it](https://monday.com/blog/project-management/keep-scope-creep-undermining-project/)
- [What Is Scope Creep and How Can I Avoid It?](https://www.projectmanager.com/blog/5-ways-to-avoid-scope-creep)

---

### Pitfall 4: Accessibility Regressions Through Visual Changes

**What goes wrong:**
Team refreshes UI focusing on aesthetics. New design reduces contrast ratios. Keyboard navigation breaks. Screen readers lose context. Automated tests don't catch it. Accessibility complaint or lawsuit arrives months later.

**Why it happens:**
- Designers optimize for visual appeal without WCAG 2.2 knowledge
- Developers implement designs without accessibility validation
- "Looks fine to me" testing bias (able-bodied team members)
- Automated tools miss context-dependent issues
- No accessibility testing in CI/CD pipeline
- Assumption that "we didn't change functionality" means accessibility is fine

**Consequences:**
- Legal risk (WCAG 2.2 AA compliance required in 2026)
- User exclusion (keyboard users, screen reader users cannot use app)
- Expensive remediation (harder to fix after launch than during development)
- Brand damage (seen as not caring about accessibility)
- Recurring regressions (without systematic prevention)

**Prevention:**
1. **Automated accessibility testing in CI** - Lighthouse, Pa11y, or axe-core on every build
2. **Manual keyboard testing** - Every component must be fully keyboard-navigable
3. **Color contrast validation** - Use tools like Contrast Analyzer during design phase
4. **Screen reader testing** - ChromeVox or NVDA testing before merge
5. **Focus indicator visibility** - Ensure focus states meet contrast requirements
6. **ARIA label auditing** - Verify labels remain correct after visual changes
7. **Regression tracking** - Flag accessibility score decreases automatically

**Detection:**
- Lighthouse accessibility score drops
- Automated tests show WCAG violations
- Tab navigation skips elements or shows no focus indicator
- Color contrast ratios < 4.5:1 for normal text, < 3:1 for large text
- Screen reader announces generic labels ("button" instead of "Submit form")

**Phase to address:**
- Phase 0: Add accessibility testing to CI/CD pipeline BEFORE refresh starts
- Phase 1: Baseline accessibility audit - fix existing issues before introducing new ones
- Throughout: Accessibility review as merge requirement for every PR
- Post-launch: Quarterly accessibility audits to catch drift

**Sources:**
- [2026 WCAG & ADA Website Compliance Requirements & Standards](https://www.accessibility.works/blog/wcag-ada-website-compliance-standards-requirements/)
- [WebAIM: 2026 Predictions: The Next Big Shifts in Web Accessibility](https://webaim.org/blog/2026-predictions/)
- [Automating Accessibility Testing in 2026](https://www.browserstack.com/guide/automate-accessibility-testing)
- [Manual accessibility testing | web.dev](https://web.developers.google.cn/learn/accessibility/test-manual)

---

### Pitfall 5: No Visual Regression Testing

**What goes wrong:**
Developer updates Button component for consistency. Changes cascade unexpectedly to 47 different contexts. Modal footer breaks. Table actions misalign. Mobile view collapses. Catches the issues days after merge when users complain.

**Why it happens:**
- Underestimating ripple effects of shared component changes
- No systematic way to preview component in all contexts
- Manual testing only covers obvious use cases
- Assumption that TypeScript will catch breaking changes (it won't catch visual breaks)
- Cost/complexity concerns about visual regression tooling

**Consequences:**
- Visual bugs shipped to production
- Developer fear of changing shared components (fostering inconsistency)
- Time wasted manually testing every component usage
- Regression bugs in areas "not supposed to change"
- Loss of confidence in component library

**Prevention:**
1. **Visual regression testing tooling** - Chromatic, Percy, Argos, or Playwright visual testing
2. **Storybook for component inventory** - Document every variant and state
3. **Snapshot testing baseline** - Create baseline before refresh starts
4. **Component library CI checks** - Block merges if visual changes unreviewed
5. **Dedicated review for visual changes** - Side-by-side diff for all component updates

**Detection:**
- Bug reports: "Button looks different on X page"
- Inconsistent spacing/sizing across same component type
- Components break when props change
- Fear-driven development (afraid to touch shared components)
- Lack of component documentation showing all variants

**Phase to address:**
- Phase 0: Set up visual regression testing infrastructure
- Phase 1: Create baseline snapshots of ALL current components before any changes
- Throughout: Require visual regression review for component library changes
- Post-refresh: Maintain visual regression suite as ongoing practice

**Sources:**
- [How to Implement Visual Regression Testing for React with Chromatic](https://oneuptime.com/blog/post/2026-01-15-visual-regression-testing-react-chromatic/view)
- [Scaling Visual Regression Testing for the Component Ecosystem of MUI](https://argos-ci.com/customers/mui)
- [Testing in 2026: Jest, React Testing Library, and Full Stack Testing Strategies](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or quality issues but are recoverable.

### Pitfall 6: Inconsistent Design Token Usage

**What goes wrong:**
Team creates comprehensive design tokens in tailwind.config.js (primary-600, gray-200, etc.). Developers still use arbitrary values: `className="text-[#1e3a5f]"` or `bg-slate-700` instead of `bg-gray-700`. Design "system" becomes design "suggestion."

**Why it happens:**
- Tokens not documented or discoverable
- Developers don't know tokens exist
- Faster to use color picker than look up token name
- No enforcement mechanism
- Legacy code uses arbitrary values (monkey-see-monkey-do)

**Consequences:**
- Inconsistency persists despite having design system
- Cannot update theme (colors hardcoded across codebase)
- Difficult to ensure brand consistency
- Wasted effort creating tokens nobody uses

**Prevention:**
1. **ESLint rule against arbitrary values** - Warn or error on `[#...]` or non-standard color scales
2. **Document tokens visually** - Storybook page showing all colors, spacing, shadows
3. **Code review checklist** - "Are design tokens used instead of arbitrary values?"
4. **Migration script** - Replace common arbitrary values with tokens
5. **Restrict Tailwind config** - Disable default color palette, force token usage

**Detection:**
- Grep for `className.*\[#` (arbitrary hex values)
- Grep for `slate-|zinc-|neutral-` (non-standard color scales)
- Inconsistent colors in production (blues that don't match)
- Inability to theme application (colors not centralized)

**Phase to address:**
- Phase 1: Document tokens and add ESLint enforcement
- Throughout: Code review enforcement

**Sources:**
- [Tailwind CSS Best Practices 2025-2026: Design Tokens, Typography & Responsive Patterns](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns)
- [5 best practices for preventing chaos in Tailwind CSS](https://evilmartians.com/chronicles/5-best-practices-for-preventing-chaos-in-tailwind-css)

---

### Pitfall 7: Component Definition Inside Render Functions

**What goes wrong:**
During refresh, developers extract inline JSX to "components." But they define components inside parent render functions. Every parent re-render recreates child component, destroying state, breaking performance, confusing React DevTools.

**Why it happens:**
- Convenience (component defined where it's used)
- Not understanding React component lifecycle
- Copying patterns from legacy code
- Wanting to access parent scope without props

**Consequences:**
- Performance degradation (component recreated every render)
- State loss (form inputs reset unexpectedly)
- React DevTools shows "Anonymous" components
- Difficult to test components (not exported)
- Props drilling avoided but at high cost

**Prevention:**
1. **ESLint rule** - Detect component definitions inside functions
2. **Code review awareness** - Look for `const MyComponent = () =>` inside render
3. **Extract to module** - Define components at module level or separate file
4. **Use composition** - Pass children/render props instead of inline components

**Detection:**
- Search for component definitions inside other components
- Performance issues (unnecessary re-renders)
- State resets unexpectedly
- React DevTools shows `<Unknown>` or `<Anonymous>`

**Phase to address:**
- Phase 0: Add ESLint rule before refresh
- Throughout: Code review enforcement

**Sources:**
- [6 Common React Anti-Patterns That Are Hurting Your Code Quality](https://itnext.io/6-common-react-anti-patterns-that-are-hurting-your-code-quality-904b9c32e933)
- [The Terrible React Anti-Pattern You Must Avoid](https://dev.to/shameel/the-terrible-react-anti-pattern-you-must-avoid-4el8)

---

### Pitfall 8: Mixing Multiple UI Libraries

**What goes wrong:**
Project already uses Heroicons. During refresh, developer finds perfect component in different library. Now shipping both. Then another. Bundle size explodes, styles conflict, inconsistency returns.

**Why it happens:**
- "Just this one component" mentality
- Lack of awareness of bundle size impact
- Urgency to ship (faster to use existing than build custom)
- No policy against multiple libraries

**Consequences:**
- Bundle size bloat (multiple icon libraries, component libraries)
- Style conflicts (CSS from multiple sources)
- Inconsistent UX (different interaction patterns)
- Maintenance burden (updates across multiple libraries)
- Runtime conflicts (competing global styles)

**Prevention:**
1. **Dependency policy** - Document which UI libraries are allowed
2. **Bundle size monitoring** - Alert on significant increases
3. **Review external components** - Require justification for new UI dependency
4. **Extract needed components** - Copy single component rather than importing library
5. **Component library decision** - Choose ONE and stick with it

**Detection:**
- package.json shows multiple icon libraries
- Multiple CSS frameworks or component libraries
- Bundle analyzer shows duplicate functionality
- Style conflicts in browser DevTools

**Phase to address:**
- Phase 0: Audit dependencies, document allowed libraries
- Throughout: Reject PRs adding new UI dependencies without strong justification

**Sources:**
- [6 Common React Anti-Patterns That Are Hurting Your Code Quality](https://itnext.io/6-common-react-anti-patterns-that-are-hurting-your-code-quality-904b9c32e933)
- [React & CSS in 2026: Best Styling Approaches Compared](https://medium.com/@imranmsa93/react-css-in-2026-best-styling-approaches-compared-d5e99a771753)

---

### Pitfall 9: Missing Component Documentation

**What goes wrong:**
Team builds comprehensive component library. Three months later, developers build duplicate components because they don't know existing ones exist. Or misuse components because props/variants not documented.

**Why it happens:**
- Documentation seen as "nice to have" under deadline pressure
- Assumption that code is self-documenting (it isn't)
- No tooling for component documentation
- Components built incrementally without catalog

**Consequences:**
- Component duplication (3 different Buttons)
- Misuse of components (wrong variants for wrong contexts)
- Slow development (reinventing wheels)
- Inconsistency (if devs don't know standard components exist)

**Prevention:**
1. **Storybook for component catalog** - Visual documentation of all components
2. **Props documentation** - JSDoc comments on all component props
3. **Usage examples** - Show correct usage in Storybook stories
4. **Review requirement** - Component not "done" until documented
5. **Search discoverability** - Make it easy to find existing components

**Detection:**
- Developers asking "do we have a component for X?" when one exists
- Similar components with different names/APIs
- Components with unclear prop purposes
- Lack of usage examples

**Phase to address:**
- Phase 1: Set up Storybook before building new components
- Throughout: Document as you build, not after

**Sources:**
- [Scaling a design system with Tailwind CSS](https://nearform.com/digital-community/scaling-a-design-system-with-tailwind-css/)
- [Don't use Tailwind for your Design System](https://sancho.dev/blog/tailwind-and-design-systems)

---

### Pitfall 10: Ignoring Bundle Size Impact

**What goes wrong:**
Visual refresh ships. Users complain about slow load times. Investigation reveals CSS bundle tripled in size. Both old and new design systems shipped. Unused Tailwind classes included. Heavy dependencies added casually.

**Why it happens:**
- No bundle size monitoring
- Focus on features over performance
- Accumulation of small additions
- "CSS is small" assumption (not true at scale)
- Lack of tree-shaking awareness

**Consequences:**
- Slow page loads (especially mobile/poor connections)
- User frustration, higher bounce rates
- SEO impact (Core Web Vitals degraded)
- Wasted bandwidth (users paying for unnecessary bytes)

**Prevention:**
1. **Bundle size monitoring** - Track CSS and JS size in CI
2. **Budget enforcement** - Fail builds exceeding size thresholds
3. **Code splitting** - Lazy load components not needed immediately
4. **Purge unused CSS** - Verify Tailwind purging works correctly
5. **Dependency auditing** - Review size of new dependencies before adding
6. **Performance budget** - Define acceptable bundle size increase

**Detection:**
- Build output shows large CSS files (>200kb)
- Lighthouse performance score decreases
- Network tab shows slow CSS download
- Webpack/Vite bundle analyzer shows bloat

**Phase to address:**
- Phase 0: Establish baseline bundle size
- Throughout: Monitor every build
- Phase completion: Verify bundle size didn't grow

**Sources:**
- [React & CSS in 2026: Best Styling Approaches Compared](https://medium.com/@imranmsa93/react-css-in-2026-best-styling-approaches-compared-d5e99a771753)
- [Technical debt: a strategic guide for 2026](https://monday.com/blog/rnd/technical-debt/)

---

## Minor Pitfalls

Mistakes that cause annoyance or small delays but are easily fixable.

### Pitfall 11: Inconsistent Spacing Scale Usage

**What goes wrong:**
Tailwind provides spacing scale (px-2, px-4, px-6). Developers use arbitrary values or skip scale steps: `px-[18px]` or inconsistent gaps between elements.

**Why it happens:**
- Pixel-perfect design compliance attempts
- Not understanding value of consistent spacing
- Designer specs using non-standard values

**Prevention:**
- ESLint rule against arbitrary spacing values
- Designer education on spacing scale
- Visual spacing guide in Storybook

**Detection:**
- Grep for `[0-9]+px]` in className attributes
- Visual inconsistency in spacing

**Phase to address:** Phase 1 (Foundation), code review throughout

---

### Pitfall 12: Over-Engineering Abstractions Too Early

**What goes wrong:**
Team creates complex abstraction system before understanding component patterns. Results in inflexible components requiring constant workarounds.

**Why it happens:**
- Premature optimization
- Fear of duplication
- Misunderstanding "DRY" principle

**Prevention:**
- Allow duplication initially
- Abstract after seeing 3+ similar patterns
- Prefer composition over complex props

**Detection:**
- Components with 10+ props
- Many boolean props for variants
- Frequent "escape hatch" props needed

**Phase to address:** Throughout, resist premature abstraction

**Sources:**
- [React Best Practices to up Your Game in 2026](https://kinsta.com/blog/react-best-practices/)

---

### Pitfall 13: Forgetting Dark Mode Considerations

**What goes wrong:**
Team refreshes UI with beautiful light mode. Later tries to add dark mode. Nothing works - hardcoded colors, missing dark variants, contrast issues.

**Why it happens:**
- Dark mode seen as "later" feature
- Not planning for theming from start
- Hardcoded colors instead of semantic tokens

**Prevention:**
- Design both modes upfront (even if dark ships later)
- Use semantic color tokens (bg-background not bg-white)
- Test dark mode variants during development

**Detection:**
- Hardcoded white/black values
- Missing dark: variants in Tailwind classes
- No dark mode testing

**Phase to address:** Phase 1 (if dark mode planned), establish semantic tokens

---

### Pitfall 14: Inconsistent Naming Conventions

**What goes wrong:**
Components named inconsistently: UserAvatar, user-card, User_Badge, ProfileImage (all user-related). Difficult to find, understand relationships.

**Why it happens:**
- Multiple developers with different preferences
- No naming convention documented
- Legacy inconsistency propagated

**Prevention:**
- Document naming conventions
- Use linter for file naming
- Consistent prefixes for related components

**Detection:**
- Mixed naming styles in component directory
- Difficulty finding components

**Phase to address:** Phase 0 (establish conventions before building)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Component Library Foundation | Premature abstraction, missing documentation | Start with Storybook, document as you build, allow duplication initially |
| Design Token Setup | Tokens defined but not enforced | ESLint rules, code review checklist, migration of existing arbitrary values |
| Page-by-Page Migration | Dual component systems persist | Hard deadline for legacy deletion, prevent new legacy usage via ESLint |
| Responsive Redesign | Missing mobile testing, arbitrary breakpoints | Test mobile-first, use Tailwind standard breakpoints only |
| Accessibility Audit | Regression in keyboard nav, contrast | Automated testing in CI, manual keyboard testing before merge |
| Performance Optimization | Bundle size creep unnoticed | Bundle size monitoring, performance budgets, lazy loading strategy |

---

## Research Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Scope creep patterns | HIGH | Multiple 2026 sources, well-documented industry pattern |
| Tailwind purging issues | HIGH | Official documentation + multiple troubleshooting guides + known gotcha |
| Accessibility regressions | HIGH | WCAG 2.2 AA official requirement for 2026, automated testing tools documented |
| React anti-patterns | HIGH | Current 2026 best practices, multiple authoritative sources |
| Visual regression testing | MEDIUM-HIGH | Tools actively used (Chromatic 2026 article), MUI case study |
| Component migration | MEDIUM | Industry patterns documented but less specific to UI refresh |
| Bundle size issues | MEDIUM | General technical debt pattern, some 2026-specific sources |

---

## Verification Notes

**What was verified:**
- Tailwind CSS purging behavior confirmed via official docs and troubleshooting articles
- WCAG 2.2 AA as 2026 standard confirmed via accessibility compliance sources
- Visual regression testing tools (Chromatic, Argos, Playwright) confirmed active in 2026
- React anti-patterns validated against multiple 2026 best practice guides
- Scope creep patterns cross-referenced across multiple project management sources

**What requires validation:**
- Specific bundle size thresholds for CogVeri (context-dependent)
- Exact ESLint rule configuration for project (needs implementation testing)
- Visual regression tool selection for CogVeri tech stack (needs evaluation)

**Sources cited:** 25+ articles and documentation pages from 2025-2026

---

## Roadmap Implications

**Phase ordering recommendations:**

1. **Foundation Phase MUST come first** - Attempting visual refresh without design tokens, ESLint rules, and visual regression testing infrastructure is high-risk.

2. **Complete migrations before expanding** - Do not start next major area (e.g., Settings) until previous area (e.g., Dashboard) has legacy components fully deleted.

3. **Accessibility testing from Day 1** - Cannot be bolted on later. Must be part of CI/CD before first component refresh.

4. **Scope freeze enforcement throughout** - Weekly scope review meetings to catch creep early.

**High-risk phases needing extra attention:**

- **Component library creation** - Risk of dual systems persisting, premature abstraction
- **First page migration** - Sets patterns for rest of project, must establish good practices
- **Mobile responsive work** - Often reveals functional issues tempting scope creep

**Recommended research flags:**

- None - UI refresh is well-understood domain with established patterns. Pitfalls are predictable and preventable through discipline rather than novel technical solutions.
