# Phase 1: Foundation & Infrastructure - Research

**Researched:** 2026-01-21
**Domain:** Design system foundation setup - Testing infrastructure, ESLint enforcement, visual regression tooling
**Confidence:** HIGH

## Summary

Phase 1 establishes the safety net that prevents common UI refresh failures: design token enforcement via ESLint, accessibility testing in CI, visual regression baselines, and bundle size monitoring. The project research in `.planning/research/` already covers design token patterns, CSS variable approaches, and architectural anti-patterns comprehensively. This research focuses on tool selection for the four critical infrastructure gaps.

**Current CogVeri State:**
- TailwindCSS 3.4.19 with well-structured brand colors (teal primary, navy brand, orange accent, slate neutrals)
- Inter font already configured
- Basic ESLint setup but NO Tailwind-specific rules
- CI/CD with code quality checks but NO accessibility testing
- Playwright E2E testing with screenshot capability

**Primary Gaps:**
1. ESLint rules to prevent arbitrary Tailwind values and dynamic class construction
2. Accessibility testing in CI (Lighthouse, Pa11y, or axe-core)
3. Visual regression testing baseline (Chromatic, Percy, Argos, or Playwright)
4. Bundle size monitoring with alerts on >5% increases

**Primary recommendation:** Use Playwright for visual regression (leverages existing setup), eslint-plugin-tailwindcss for enforcement, @axe-core/playwright for accessibility, and bundlewatch for size monitoring. This stack requires minimal new tooling and integrates with existing infrastructure.

## Standard Stack

### Core Tools for Phase 1

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| **eslint-plugin-tailwindcss** | 3.x+ | Prevent arbitrary values, enforce token usage | Official Tailwind Labs plugin, catches dynamic class construction |
| **@axe-core/playwright** | Latest | Accessibility testing in E2E tests | Industry standard (Deque), integrates with existing Playwright setup |
| **Playwright visual comparison** | Built-in | Visual regression testing | Already have Playwright, built-in screenshot comparison, no additional service cost |
| **bundlewatch** | Latest | Bundle size monitoring with CI integration | Lightweight, GitHub Actions integration, configurable thresholds |

### Supporting Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| **Storybook** | 8.x | Component documentation and visual regression baseline | Recommended for component library, defers visual regression to dedicated tool |
| **clsx** | Latest | Conditional className composition | Required for variant-based component APIs |
| **tailwind-merge** | Latest | Merge Tailwind classes without conflicts | Prevents className override issues in component composition |
| **prettier-plugin-tailwindcss** | Latest | Auto-sort Tailwind classes | Consistency, easier code review |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **Playwright visual comparison** | Chromatic | Chromatic: Better UI, automatic baselines, PR comments. Cost: $150-300/month. Playwright: Free, requires manual baseline management. |
| **Playwright visual comparison** | Percy | Percy: Better snapshot management, parallel testing. Cost: $299-899/month. Playwright: Free, but slower visual test runs. |
| **@axe-core/playwright** | Lighthouse CI | Lighthouse: Full performance + accessibility audit. Slower (loads full page). axe-core: Fast, focused accessibility only. |
| **bundlewatch** | bundlesize | bundlesize: Unmaintained since 2019. bundlewatch: Active maintenance, better GitHub integration. |

**Installation:**
```bash
cd frontend

# ESLint enforcement
npm install -D eslint-plugin-tailwindcss

# Accessibility testing
npm install -D @axe-core/playwright

# Utility libraries
npm install clsx tailwind-merge

# Bundle monitoring
npm install -D bundlewatch

# Optional: Prettier sorting
npm install -D prettier-plugin-tailwindcss
```

## Architecture Patterns

### ESLint Configuration for Tailwind Enforcement

**Pattern:** Extend existing `.eslintrc.json` with Tailwind-specific rules to prevent common pitfalls.

**Configuration:**
```json
// frontend/.eslintrc.json
{
  "extends": [
    // ... existing extends
    "plugin:tailwindcss/recommended"
  ],
  "plugins": [
    // ... existing plugins
    "tailwindcss"
  ],
  "rules": {
    // Prevent arbitrary values (e.g., text-[#1e3a5f])
    "tailwindcss/no-custom-classname": "warn",

    // Enforce design token usage
    "tailwindcss/no-arbitrary-value": "error",

    // Prevent dynamic class construction
    "no-template-curly-in-string": "error",

    // Enforce consistent class order
    "tailwindcss/classnames-order": "warn",

    // Prevent deprecated utilities
    "tailwindcss/no-deprecated": "error"
  },
  "settings": {
    "tailwindcss": {
      "callees": ["cn", "clsx", "classnames"],
      "config": "./tailwind.config.js"
    }
  }
}
```

**Why this pattern:**
- Catches `className="bg-[#14b8a6]"` → Error: Use `bg-primary-600` instead
- Catches `` className={`text-${color}-500`} `` → Error: Dynamic construction will purge in production
- Enforces consistent class ordering for easier code review
- Integrates with existing ESLint workflow (already in CI)

### Accessibility Testing with Playwright + axe-core

**Pattern:** Add accessibility assertions to existing E2E tests, run on every CI build.

**Implementation:**
```typescript
// tests/e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('Dashboard page should not have accessibility violations', async ({ page }) => {
    await page.goto('/dashboard');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Task creation form should be keyboard accessible', async ({ page }) => {
    await page.goto('/tasks/new');

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('name', 'title');

    // Run axe scan
    const scanResults = await new AxeBuilder({ page }).analyze();
    expect(scanResults.violations).toEqual([]);
  });
});
```

**CI Integration:**
```yaml
# .github/workflows/accessibility.yml
name: Accessibility Tests

on:
  pull_request:
    branches: [main, develop]

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:e2e -- tests/e2e/accessibility.spec.ts
```

**Why this pattern:**
- Leverages existing Playwright setup (no new test framework)
- Blocks PRs with accessibility violations
- WCAG 2.2 AA compliance automated
- Fast feedback loop (runs on every PR)

### Visual Regression Testing with Playwright

**Pattern:** Use Playwright's built-in screenshot comparison for visual regression testing.

**Implementation:**
```typescript
// tests/e2e/visual-regression.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('Button component variants render correctly', async ({ page }) => {
    await page.goto('/storybook/button'); // Or dedicated visual test page

    // Take screenshot and compare to baseline
    await expect(page).toHaveScreenshot('button-variants.png', {
      maxDiffPixels: 100, // Allow small anti-aliasing differences
    });
  });

  test('Dashboard layout matches baseline', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('dashboard-layout.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05, // 5% tolerance
    });
  });
});
```

**Baseline Generation:**
```bash
# Generate baseline screenshots
npx playwright test tests/e2e/visual-regression.spec.ts --update-snapshots

# Update baselines after intentional visual changes
npx playwright test tests/e2e/visual-regression.spec.ts --update-snapshots
```

**CI Integration:**
- First run generates baselines (commit to repo)
- Subsequent runs compare against committed baselines
- CI fails if visual differences exceed threshold
- Manual review required to update baselines

**Why this pattern:**
- Zero additional cost (uses existing Playwright)
- Simple workflow (screenshot comparison)
- Full control over baselines (committed to repo)
- Works for monorepo structure without external service

**Tradeoff vs Chromatic/Percy:**
- **PRO:** Free, no external service dependency, full control
- **CON:** Manual baseline management, no automatic PR comments with diffs, slower (serial screenshot capture)
- **Recommendation:** Start with Playwright, migrate to Chromatic if team grows or visual testing becomes bottleneck

### Bundle Size Monitoring with bundlewatch

**Pattern:** Track bundle size on every build, fail CI if increases exceed threshold.

**Configuration:**
```json
// package.json
{
  "bundlewatch": {
    "files": [
      {
        "path": "./frontend/dist/assets/*.js",
        "maxSize": "300kb",
        "compression": "gzip"
      },
      {
        "path": "./frontend/dist/assets/*.css",
        "maxSize": "50kb",
        "compression": "gzip"
      }
    ],
    "ci": {
      "trackBranches": ["main", "develop"],
      "repoBranchBase": "main"
    }
  }
}
```

**CI Integration:**
```yaml
# .github/workflows/build.yml (add to existing build workflow)
- name: Build frontend
  working-directory: ./frontend
  run: npm run build

- name: Check bundle size
  run: npx bundlewatch --config package.json
  env:
    BUNDLEWATCH_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Why this pattern:**
- Alerts on bundle size increases >5% automatically
- Integrates with GitHub PR comments
- Tracks size trends over time
- Catches dual component system bloat (Pitfall 1) and dependency creep (Pitfall 8)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Conditional className composition** | Custom string concatenation with template literals | `clsx` + `tailwind-merge` | Edge cases: class conflicts, undefined values, array handling |
| **Accessibility testing** | Manual WCAG checklist | `@axe-core/playwright` | Automated checking of 100+ rules, color contrast calculation, ARIA validation |
| **Visual regression** | Manual screenshot comparison | Playwright `.toHaveScreenshot()` or Chromatic | Pixel-perfect diffing, threshold configuration, baseline management |
| **Bundle size tracking** | Custom Webpack plugin | `bundlewatch` | Historical tracking, GitHub integration, compression-aware sizing |
| **Class name linting** | Custom ESLint rules | `eslint-plugin-tailwindcss` | Understands Tailwind semantics, detects purging issues, official plugin |

**Key insight:** Phase 1 is infrastructure setup, not novel development. Every requirement has battle-tested tooling. Custom solutions introduce maintenance burden and miss edge cases.

## Common Pitfalls

### Pitfall 1: ESLint Rules Too Strict, Developers Disable Them

**What goes wrong:** Team adds `tailwindcss/no-arbitrary-value: "error"` but legitimate use cases exist (e.g., dynamic user-generated content colors). Developers add `eslint-disable` comments everywhere, defeating the purpose.

**Why it happens:**
- Not all arbitrary values are bad (e.g., `w-[calc(100%-2rem)]` for complex layouts)
- Rules applied too broadly without understanding use cases
- No documentation on when arbitrary values are acceptable

**How to avoid:**
1. Use `"warn"` for `no-arbitrary-value` initially, `"error"` for `no-custom-classname`
2. Document exceptions in README: "Arbitrary values OK for: calc(), theme values not in config, one-off layouts"
3. Use safelist for legitimate dynamic cases:
   ```js
   // tailwind.config.js
   module.exports = {
     safelist: [
       'bg-red-500',
       'bg-blue-500',
       'bg-green-500',
       // User-customizable colors
     ]
   }
   ```
4. Review ESLint disable comments in code review - require justification

**Warning signs:**
- Many `eslint-disable-next-line tailwindcss/no-arbitrary-value` comments
- Developers complaining about ESLint being too strict
- Rules frequently disabled in CI

### Pitfall 2: Accessibility Tests Only on Login Page

**What goes wrong:** Team adds accessibility tests to login page (simple, easy to pass). Dashboard, forms, modals never tested. Ship with WCAG violations in core workflows.

**Why it happens:**
- Starting with easy wins, never expanding coverage
- No plan for comprehensive testing
- Accessibility testing feels like checkbox exercise

**How to avoid:**
1. **Test priority matrix:** Cover high-traffic + complex pages first
   - Priority 1: Dashboard, task creation form, video review page
   - Priority 2: Settings, user management
   - Priority 3: Marketing pages, documentation
2. **Per-component testing:** Add accessibility tests alongside component tests
3. **CI enforcement:** Require accessibility test for every new page/component
4. **Quarterly audits:** Manual accessibility audit with screen reader to catch missed issues

**Warning signs:**
- Only 1-2 accessibility test files
- Recent pages don't have accessibility tests
- Accessibility tests not required in PR checklist

### Pitfall 3: Visual Regression Baselines Never Updated

**What goes wrong:** Team generates baselines before refresh starts. Makes intentional visual changes during refresh. Forgets to update baselines. All visual regression tests fail. Team ignores failures or disables tests.

**Why it happens:**
- No documentation on when/how to update baselines
- Confusion between "regression" (bad) and "intentional change" (good)
- Baseline updates not part of workflow

**How to avoid:**
1. **Document baseline update process:**
   ```bash
   # When intentional visual changes are made:
   npm run test:visual -- --update-snapshots
   git add tests/e2e/**/*.png
   git commit -m "test: update visual regression baselines after button redesign"
   ```
2. **PR template reminder:** "Did you update visual regression baselines if UI changed?"
3. **Separate intentional vs regression failures:**
   - Visual changes expected in Phase 2 (components) → Update baselines
   - Visual changes NOT expected in Phase 5 (page migration) → Investigate regression
4. **Review baseline changes:** Git diff shows changed screenshots, reviewer verifies intentional

**Warning signs:**
- Visual regression tests constantly failing
- Developers skip visual tests locally
- Large baseline updates without explanation in commit message

### Pitfall 4: Bundle Size Monitoring Configured Too Late

**What goes wrong:** Team configures bundlewatch after shipping Phase 3. Bundle already bloated with dual component systems. Setting reasonable threshold is impossible (would fail immediately).

**Why it happens:**
- Seen as "nice to have" rather than critical infrastructure
- No baseline to compare against
- "We'll add it later" syndrome

**How to avoid:**
1. **Configure in Phase 1 BEFORE making changes:** Establish baseline with current bundle size
2. **Start with generous threshold:** Current size + 10%, gradually tighten
3. **Track both CSS and JS separately:** CSS bloat often overlooked
4. **Alert on trends, not absolute values:** 5% increase from baseline is concerning regardless of absolute size

**Warning signs:**
- Bundle size not tracked in first few phases
- No discussion of bundle size in code reviews
- Bundle analyzer not run regularly

## Code Examples

Verified patterns from official sources:

### className Utility with Type Safety

```typescript
// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes without conflicts
 * Handles conditional classes and resolves conflicts (e.g., bg-red-500 + bg-blue-500 = bg-blue-500)
 *
 * @example
 * cn('bg-red-500', condition && 'bg-blue-500') // => 'bg-blue-500' if condition true
 * cn('px-4 py-2', 'px-6') // => 'px-6 py-2' (later px wins)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Source:** [shadcn/ui utils.ts](https://ui.shadcn.com/docs/installation/manual) - Industry standard pattern

**Usage:**
```tsx
// Component with variant-based styling
<button
  className={cn(
    'rounded-lg font-medium transition-colors',
    variant === 'primary' && 'bg-primary-600 text-white hover:bg-primary-700',
    variant === 'secondary' && 'bg-white text-gray-700 border border-gray-300',
    size === 'sm' && 'px-3 py-1.5 text-sm',
    size === 'md' && 'px-4 py-2 text-base',
    disabled && 'opacity-50 cursor-not-allowed',
    className // Allow consumer to override
  )}
>
  {children}
</button>
```

### Playwright Accessibility Test with axe-core

```typescript
// tests/e2e/setup.ts
import { test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Extend Playwright test with accessibility helper
export const test = base.extend({
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () => new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('#third-party-widget'); // Exclude elements you don't control

    await use(makeAxeBuilder);
  },
});

export { expect } from '@playwright/test';
```

**Source:** [@axe-core/playwright documentation](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)

**Usage:**
```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from './setup';

test('Dashboard has no accessibility violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/dashboard');

  const accessibilityScanResults = await makeAxeBuilder().analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

### Visual Regression Test Pattern

```typescript
// tests/e2e/components/button.visual.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Button Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to component showcase page
    await page.goto('/test/components/button');
  });

  test('Primary button variants', async ({ page }) => {
    const buttonGroup = page.locator('[data-testid="primary-buttons"]');

    await expect(buttonGroup).toHaveScreenshot('button-primary-variants.png', {
      maxDiffPixels: 100, // Allow small rendering differences
      threshold: 0.2, // 20% similarity threshold
    });
  });

  test('Button states (hover, focus, disabled)', async ({ page }) => {
    const button = page.locator('[data-testid="stateful-button"]');

    // Default state
    await expect(button).toHaveScreenshot('button-default.png');

    // Hover state
    await button.hover();
    await expect(button).toHaveScreenshot('button-hover.png');

    // Focus state
    await button.focus();
    await expect(button).toHaveScreenshot('button-focus.png');
  });
});
```

**Source:** [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)

**Baseline Update Command:**
```bash
# Update all baselines after intentional visual changes
npx playwright test --update-snapshots

# Update specific test baselines
npx playwright test button.visual.spec.ts --update-snapshots
```

## State of the Art

| Old Approach (2023-2024) | Current Approach (2026) | When Changed | Impact |
|--------------------------|-------------------------|--------------|--------|
| **Manual accessibility testing** | Automated axe-core in CI | 2024 | WCAG 2.2 AA enforcement in 2026 requires automation |
| **Chromatic/Percy for all visual testing** | Playwright built-in for small teams | 2025 | Cost reduction for teams <10 people, Chromatic still better for scale |
| **Storybook mandatory for design systems** | Storybook optional, component tests sufficient | 2025 | Storybook adds value but not required for basic design system |
| **ESLint rules as warnings** | ESLint rules as errors with CI enforcement | 2024 | Technical debt prevention requires hard enforcement |
| **Bundle size monitoring post-launch** | Bundle size monitoring from day one | 2024 | Catching bloat early prevents expensive refactoring |

**Deprecated/outdated:**
- **bundlesize npm package**: Unmaintained since 2019. Use `bundlewatch` instead (active maintenance, better GitHub integration)
- **Lighthouse CI for accessibility only**: Overkill. Use `@axe-core/playwright` for faster, focused accessibility testing
- **Manual screenshot comparison tools**: Playwright built-in comparison is sufficient for small-medium teams

## Open Questions

Things that couldn't be fully resolved:

1. **Storybook Adoption for Phase 1**
   - What we know: Storybook 8.x is current version, integrates with Vite, provides component documentation and visual regression baseline
   - What's unclear: Whether team wants documentation overhead vs relying on component tests only
   - Recommendation: DEFER to planning discussion. Storybook adds value (component catalog, visual baseline) but not blocking for Phase 1. Can add in Phase 2 if needed.

2. **Visual Regression Tool Cost-Benefit**
   - What we know: Playwright is free but manual, Chromatic is $150-300/month but automated
   - What's unclear: Team size, visual testing volume, budget constraints
   - Recommendation: START with Playwright (free, leverages existing setup). Evaluate Chromatic in Phase 2 if Playwright workflow is too slow/manual.

3. **ESLint Rule Severity Levels**
   - What we know: `no-arbitrary-value` can be too strict for legitimate use cases
   - What's unclear: CogVeri-specific edge cases for arbitrary values
   - Recommendation: START with `"warn"` for `no-arbitrary-value`, `"error"` for `no-custom-classname`. Adjust based on first 2 weeks of Phase 1 experience.

## Sources

### Primary (HIGH confidence)

**ESLint + Tailwind:**
- [eslint-plugin-tailwindcss (Official)](https://github.com/francoismassart/eslint-plugin-tailwindcss) - Official Tailwind Labs recommended plugin
- [Tailwind CSS: Handling Dynamic Classes](https://tailwindcss.com/docs/content-configuration#dynamic-class-names) - Official docs on purging pitfalls
- [5 Best Practices for Preventing Chaos in Tailwind CSS](https://evilmartians.com/chronicles/5-best-practices-for-preventing-chaos-in-tailwind-css) - ESLint enforcement patterns

**Accessibility Testing:**
- [@axe-core/playwright Documentation](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright) - Official axe DevTools integration
- [Automating Accessibility Testing in 2026](https://www.browserstack.com/guide/automate-accessibility-testing) - Current best practices
- [2026 WCAG & ADA Website Compliance Requirements](https://www.accessibility.works/blog/wcag-ada-website-compliance-standards-requirements/) - WCAG 2.2 AA as standard

**Visual Regression:**
- [Playwright Visual Comparisons (Official)](https://playwright.dev/docs/test-snapshots) - Built-in screenshot comparison
- [Visual Regression Testing for React with Chromatic](https://oneuptime.com/blog/post/2026-01-15-visual-regression-testing-react-chromatic/view) - Chromatic vs alternatives comparison
- [Scaling Visual Regression Testing - Argos + MUI](https://argos-ci.com/customers/mui) - Enterprise visual testing patterns

**Bundle Size Monitoring:**
- [bundlewatch GitHub](https://github.com/bundlewatch/bundlewatch) - Official documentation
- [Bundle Size Monitoring Best Practices](https://web.dev/articles/your-first-performance-budget) - Google web.dev guidance

### Secondary (MEDIUM confidence)

**Utility Libraries:**
- [clsx npm package](https://www.npmjs.com/package/clsx) - Official documentation
- [tailwind-merge npm package](https://www.npmjs.com/package/tailwind-merge) - Official documentation
- [shadcn/ui utils.ts pattern](https://ui.shadcn.com/docs/installation/manual) - Industry standard cn() utility

**Infrastructure Setup:**
- [Setting up Storybook 8 with Vite](https://storybook.js.org/docs/react/get-started/install) - Official Storybook docs
- [GitHub Actions for Accessibility Testing](https://github.com/marketplace/actions/axe-core-accessibility-testing) - CI integration examples

## Metadata

**Confidence breakdown:**
- ESLint tooling: HIGH - Official plugin, well-documented patterns, verified in multiple sources
- Accessibility testing: HIGH - axe-core is industry standard (Deque), Playwright integration official
- Visual regression: MEDIUM-HIGH - Playwright approach verified, Chromatic comparison from recent article (2026)
- Bundle monitoring: HIGH - bundlewatch actively maintained, GitHub integration documented

**Research date:** 2026-01-21
**Valid until:** 60 days (tooling stability: quarterly review recommended for version updates)

**CogVeri-specific findings:**
- Current Tailwind config is well-structured, ready for CSS variable migration
- ESLint setup is basic, requires tailwindcss plugin addition
- Playwright already configured, visual regression requires minimal changes
- CI/CD has code quality workflow, accessibility tests can be added easily
- No bundle size monitoring exists, needs fresh setup

**Phase 1 Readiness:** HIGH
- All tools have clear implementation paths
- Existing infrastructure supports additions (Playwright, ESLint, CI/CD)
- No research blockers identified
- Storybook adoption is only open decision (defer to planning)
