# Phase 5: Page Migration & Legacy Cleanup - Research

**Researched:** 2026-01-22
**Domain:** React page migration, component replacement, legacy code deletion
**Confidence:** HIGH

## Summary

Phase 5 involves migrating 35 production pages from legacy `components/ui` imports to the new design system (`components/ui/patterns`, `components/ui/composites`) built in Phases 1-4. The codebase currently runs a dual system with ~21 legacy primitive components in `components/ui/` alongside the new design system structure.

The migration scope is well-defined: authenticated pages (Dashboard, Tasks, Settings, Reviews) use similar legacy components (Card, Button, StatusBadge, LoadingSpinner) while public pages (Landing, Pricing, Enterprise) have heavy inline styling. Domain-specific components (rubric builder, video players, recording setup) are intentionally OUT OF SCOPE per project decisions.

**Primary recommendation:** Migrate authenticated internal pages first (Dashboard → Tasks → Reviews → Settings), establish migration patterns via component mapping table, then tackle public marketing pages with heavier custom styling. Delete legacy `components/ui/` files only AFTER all pages are migrated and visual regression tests pass.

## Standard Stack

The established libraries/tools for this domain (already in use):

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | UI library | Already in use, hook-based patterns established |
| React Router | 6.x | Client-side routing | Already in use for page navigation |
| TanStack Query | 4.x | Server state | Already in use, all pages use `useQuery` |
| lucide-react | Latest | Icon library | Phase 4 decision, exclusive icon system |

### Design System (Built in Phases 1-4)
| Component Type | Location | Examples | Status |
|----------------|----------|----------|--------|
| Primitives | `ui/` root | Button, Input, Card, Badge, Checkbox, Avatar, Icon | BUILT ✅ |
| Composites | `ui/composites/` | Toast, Modal, Alert, FormField, Dropdown | BUILT ✅ |
| Patterns | `ui/patterns/` | DataTable, Breadcrumbs, DashboardLayout, SettingsLayout, Charts | BUILT ✅ |
| Loading States | `ui/Loading/` | Spinner, Progress, Skeleton | BUILT ✅ |

### Legacy Components (To Replace)
| Legacy Component | Location | Replacement | Notes |
|------------------|----------|-------------|-------|
| Button | `ui/Button.tsx` | Same, use design system version | Already exists |
| Card | `ui/Card.tsx` | Same, use design system version | Already exists |
| Input | `ui/Input.tsx` | Same, use design system version | Already exists |
| Modal | `ui/Modal.tsx` | `ui/composites/Modal/Modal.tsx` | New one uses Radix |
| LoadingSpinner | `ui/LoadingSpinner.tsx` | `ui/Loading/Spinner.tsx` | Renamed location |
| Tabs | `ui/Tabs.tsx` | Keep as-is or build new | TBD |
| Select | `ui/Select.tsx` | `ui/composites/Dropdown.tsx` | For searchable dropdowns |
| StatusBadge | `ui/StatusBadge.tsx` | Keep domain-specific | Not generic |
| PriorityBadge | `ui/PriorityBadge.tsx` | Keep domain-specific | Not generic |
| ExpandableRichText | `ui/ExpandableRichText.tsx` | Keep as pattern | No replacement needed |
| RichTextEditor | `ui/RichTextEditor.tsx` | Keep as pattern | No replacement needed |
| VideoPlayer | `ui/VideoPlayer.tsx` | Keep as domain component | OUT OF SCOPE |
| EmptyState | `ui/EmptyState.tsx` | Same, use design system version | Already enhanced in Phase 3 |

**Installation:**
No new packages needed. All design system components already built.

## Architecture Patterns

### Migration Strategy Pattern

**Sequential page-by-page migration:**
```
1. Pick page from priority list
2. Run visual regression baseline (Playwright screenshot)
3. Replace legacy imports with design system equivalents
4. Verify UI unchanged via snapshot comparison
5. Test interactivity (forms, modals, navigation)
6. Commit migration for that page
7. Move to next page
8. Delete legacy component only when zero usage remains
```

**Why this pattern:**
- Prevents "big bang" rewrites that introduce bugs
- Each page migration is independently testable
- Can roll back single page without breaking others
- Visual regression catches styling drift early

### Component Replacement Pattern

**Import path mapping:**
```typescript
// BEFORE (legacy)
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { StatusBadge, PriorityBadge } from '../../components/ui';

// AFTER (design system)
import { Button } from '../../components/ui/Button'; // Primitives
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Loading'; // Note: renamed
import { StatusBadge, PriorityBadge } from '../../components/ui'; // Keep domain-specific
```

**Critical insight:** Some components are NOT legacy but domain-specific (StatusBadge, PriorityBadge, VideoPlayer). These should remain in `ui/` as they're CogVeri-specific, not generic design system components.

### Legacy Deletion Pattern

**Never delete until:**
1. Run `grep -r "from.*components/ui/Button" frontend/src` returns ZERO results
2. Visual regression tests pass for all pages
3. Bundle size check confirms no increase
4. Accessibility tests still pass

**Safe deletion order:**
```bash
# 1. Find unused legacy components
find frontend/src/components/ui -name "*.tsx" -not -path "*/composites/*" -not -path "*/patterns/*" -not -path "*/Loading/*"

# 2. For each component, check usage
grep -r "from.*components/ui/Button" frontend/src

# 3. Delete only when count is 0
rm frontend/src/components/ui/Button.tsx
```

### Anti-Patterns to Avoid

- **Changing functionality during migration:** Visual refresh only, no feature changes
- **Deleting legacy components while still imported:** Causes build failures
- **Running dual systems indefinitely:** Hard deadline needed (see Roadmap pitfall #1)
- **Skipping visual regression tests:** Causes subtle UI drift

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Component usage detection | Manual grep | `depcheck` or `ts-unused-exports` | Misses dynamic imports, barrel exports |
| Visual regression | Manual QA | Playwright screenshot comparison | Human eyes miss 1-2px shifts |
| Import path migration | Find/replace | `jscodeshift` codemod | Handles edge cases (default vs named exports) |
| Dead code elimination | Manual deletion | Build unused code detection first | Prevents accidentally breaking imports |

**Key insight:** Build automated usage detection before deleting any legacy component. A single missed import breaks production.

## Page Inventory

### Authenticated Pages (Priority Migration)

#### PAGE-01: Dashboard/Home (HIGH PRIORITY)
- **File:** `frontend/src/pages/dashboard/Dashboard.tsx`
- **Size:** 403 lines
- **Legacy imports:** `LoadingSpinner`, `StatusBadge`
- **Complexity:** Medium (custom stat cards, activity panel, task breakdown)
- **Design system ready:** Yes - can use DashboardLayout pattern
- **Migration effort:** ~2 hours (custom components to refactor)
- **Inline styles:** 63 className usages (heavy custom styling)

#### PAGE-02: Task Management Pages (HIGH PRIORITY)
**Tasks List:**
- **File:** `frontend/src/pages/tasks/Tasks.tsx`
- **Size:** 935 lines
- **Legacy imports:** `StatusBadge`, `PriorityBadge`, `ExpandableRichText`
- **Complexity:** High (kanban view, list view, statistics, filters)
- **Design system ready:** Partial - can use DataTable for list view
- **Migration effort:** ~4-6 hours (complex state management)
- **Inline styles:** Heavy (custom kanban layout)

**Task Detail:**
- **File:** `frontend/src/pages/tasks/TaskDetail.tsx`
- **Size:** 231 lines
- **Legacy imports:** `RichTextContent`, `StatusBadge`, `PriorityBadge`
- **Complexity:** Low (simple detail view)
- **Design system ready:** Yes - straightforward Card usage
- **Migration effort:** ~1 hour

#### PAGE-03: Recording/Playback Pages (MEDIUM PRIORITY)
**Recordings List:**
- **File:** `frontend/src/pages/recordings/Recordings.tsx`
- **Size:** 10 lines (stub page)
- **Legacy imports:** None
- **Complexity:** Trivial
- **Migration effort:** 15 minutes (add EmptyState)

**Reviews Queue:**
- **File:** `frontend/src/pages/reviews/Reviews.tsx`
- **Size:** 499 lines
- **Legacy imports:** `LoadingSpinner`, `StatusBadge`, `PriorityBadge`, `ExpandableRichText`
- **Complexity:** Medium (filtering, status cards, archive toggle)
- **Design system ready:** Yes - can use patterns
- **Migration effort:** ~2-3 hours

**Review Detail:**
- **File:** `frontend/src/pages/reviews/ReviewDetail.tsx`
- **Size:** Not analyzed (similar to TaskDetail)
- **Complexity:** Medium (video playback integration)
- **Migration effort:** ~2 hours

#### PAGE-04: Settings/Admin Pages (MEDIUM PRIORITY)
**Organization Settings:**
- **File:** `frontend/src/pages/settings/OrganizationSettings.tsx`
- **Size:** 741 lines
- **Legacy imports:** `Card`, `Button`, `LoadingSpinner`
- **Complexity:** High (tabs, billing integration, domain management)
- **Design system ready:** Yes - can use SettingsLayout
- **Migration effort:** ~3-4 hours

**Billing:**
- **File:** `frontend/src/pages/settings/Billing.tsx`
- **Legacy imports:** `Card`, `Button`, `LoadingSpinner`
- **Complexity:** Medium (plan cards, usage display)
- **Migration effort:** ~2 hours

**Admin Pages:** (AdminDashboard, AdminSettings, AdminOrganizations, etc.)
- **Count:** ~5 pages
- **Complexity:** Medium
- **Migration effort:** ~1-2 hours each

### Public Pages (LOWER PRIORITY)

#### Marketing Pages
**Landing Page:**
- **File:** `frontend/src/pages/public/LandingPage.tsx`
- **Size:** Large (heavy custom styling)
- **Legacy imports:** Minimal (mostly inline)
- **Complexity:** High (custom gradients, animations, hero sections)
- **Migration effort:** ~4 hours (preserve marketing design)

**Pricing, Enterprise, Terms, Privacy:**
- **Files:** 4 pages
- **Complexity:** Low-Medium (mostly static content)
- **Migration effort:** ~1 hour each

#### Auth Pages (Login, Register, etc.)
- **Files:** 5 pages
- **Legacy imports:** `Button`, `Card`, `GoogleSignInButton`, `OAuthPrivacyNotice`
- **Complexity:** Low (forms with validation)
- **Migration effort:** ~1 hour each

### Domain-Specific Pages (OUT OF SCOPE)
- **Rubric Builder:** `frontend/src/pages/rubric/RubricBuilderPage.tsx` - Keep as-is
- **Analysis Results:** `frontend/src/pages/analysis/AnalysisResultsPage.tsx` - Keep VideoPlayer
- **Recording Session:** `frontend/src/pages/recordings/RecordingSession.tsx` - Complex domain logic
- **Live Session:** `frontend/src/pages/LiveSession.tsx` - Real-time features

**Total Pages:** 35 total, ~20 in migration scope, ~15 OUT OF SCOPE or trivial

## Design System Inventory (What's Available)

### Primitives (Built in Phase 2)
✅ **Ready to use:**
- `Button` - 5 variants (primary, secondary, ghost, danger, link) with CVA
- `Input` - Text, email, password, number types with validation states
- `Card` - 3 variants (default, elevated, outlined) with optional padding
- `Badge` - Generic badge (NOT StatusBadge/PriorityBadge)
- `Checkbox` - Native input with peer styling (WCAG compliant)
- `Avatar` - User avatars with fallback initials
- `Icon` - Thin wrapper for lucide-react

### Composites (Built in Phase 3)
✅ **Ready to use:**
- `Toast` - Auto-dismiss notifications with 5-toast stacking limit
- `Modal` - Radix Dialog with focus trap and compound component pattern
- `Alert` - Persistent feedback (vs Toast for ephemeral)
- `FormField` - Label + Input + Error with validation hooks
- `Dropdown` - Searchable dropdown with downshift (ARIA compliant)

### Patterns (Built in Phase 4)
✅ **Ready to use:**
- `DataTable` - TanStack Table v8 with sorting, pagination, server-side ready
- `Breadcrumbs` - WAI-ARIA navigation with clickable ancestors
- `DashboardLayout` - Header + Sidebar + Breadcrumbs + Content area
- `SettingsLayout` - Two-column with settings nav
- `BarChart`, `LineChart`, `PieChart` - Recharts wrappers with design tokens

### Loading States (Built in Phase 2-3)
✅ **Ready to use:**
- `Spinner` - Replaces LoadingSpinner
- `Progress` - Linear progress bars
- `Skeleton` - Content placeholders

### Domain Components (Keep as-is)
❌ **NOT design system, keep in ui/:**
- `StatusBadge` - Task status visualization
- `PriorityBadge` - Task priority visualization
- `ExpandableRichText` - Rich text with expand/collapse
- `RichTextEditor` - TipTap editor wrapper
- `VideoPlayer` - Video playback with controls
- `GoogleSignInButton` - OAuth integration
- `OAuthPrivacyNotice` - Legal compliance

## Legacy Component Analysis

### Components to Replace (Zero Migration Effort)
| Component | Usage Count | Replacement | Risk |
|-----------|-------------|-------------|------|
| Button | ~50 pages | Design system Button | LOW - API identical |
| Card | ~30 pages | Design system Card | LOW - API identical |
| Input | ~20 pages | Design system Input | LOW - API identical |
| LoadingSpinner | ~15 pages | Loading/Spinner | LOW - rename only |

### Components to Replace (Medium Migration Effort)
| Component | Usage Count | Replacement | Risk |
|-----------|-------------|-------------|------|
| Modal | ~10 pages | composites/Modal | MEDIUM - API changed (compound components) |
| Tabs | ~5 pages | Build new or keep | LOW - isolated usage |
| Select | ~8 pages | composites/Dropdown | MEDIUM - API changed (downshift) |

### Components to Keep (Domain-Specific)
| Component | Reason to Keep | Location |
|-----------|----------------|----------|
| StatusBadge | CogVeri-specific task statuses | ui/StatusBadge.tsx |
| PriorityBadge | CogVeri-specific priorities | ui/PriorityBadge.tsx |
| ExpandableRichText | Content display pattern | ui/ExpandableRichText.tsx |
| RichTextEditor | TipTap integration | ui/RichTextEditor.tsx |
| VideoPlayer | Video playback logic | ui/VideoPlayer.tsx |
| GoogleSignInButton | OAuth branding | ui/GoogleSignInButton.tsx |
| OAuthPrivacyNotice | Legal compliance | ui/OAuthPrivacyNotice.tsx |
| ComingSoonBanner | Feature flags | ui/ComingSoonBanner.tsx |
| EmojiPicker | Rich content input | ui/EmojiPicker.tsx |

## Migration Complexity Assessment

### Complexity Tiers

**TIER 1: Low Complexity (1-2 hours each)**
- Simple import path changes only
- No layout changes needed
- Minimal custom styling

Pages:
- TaskDetail (231 lines, 2 legacy imports)
- Recordings stub (10 lines)
- Auth pages (Login, Register, etc.) - 5 pages
- Public static pages (Terms, Privacy) - 2 pages

**Estimated total:** ~12 hours

**TIER 2: Medium Complexity (2-4 hours each)**
- Import changes + layout pattern adoption
- Some custom component refactoring
- Moderate inline styling

Pages:
- Dashboard (403 lines, custom stat cards)
- Reviews (499 lines, filtering logic)
- OrganizationSettings (741 lines, tabs)
- Billing (medium, plan cards)
- Admin pages (5 pages)
- Public marketing (Pricing, Enterprise) - 2 pages

**Estimated total:** ~30 hours

**TIER 3: High Complexity (4-6 hours each)**
- Significant component refactoring
- Complex state management
- Heavy custom styling to preserve

Pages:
- Tasks list (935 lines, kanban + list views)
- LandingPage (heavy custom marketing design)

**Estimated total:** ~12 hours

**TIER 4: Out of Scope (Don't Touch)**
- Domain-specific features (video, rubric, recording)
- Real-time functionality (LiveSession)
- Complex AI analysis pages

Pages:
- RubricBuilderPage
- AnalysisResultsPage
- RecordingSession
- LiveSession
- RecordingSetup components
- ~15 pages total

**Grand total migration effort:** ~54 hours across ~20 pages

### Migration Order (Lowest to Highest Risk)

**Wave 1: Build confidence (Low complexity)**
1. Recordings stub - 15 min (trivial)
2. TaskDetail - 1 hour (simple detail page)
3. Auth pages - 5 hours (5 pages × 1 hour)

**Wave 2: Establish patterns (Medium complexity)**
4. Dashboard - 3 hours (sets DashboardLayout pattern)
5. Reviews - 3 hours (similar to Dashboard)
6. OrganizationSettings - 4 hours (sets SettingsLayout pattern)
7. Billing - 2 hours (follows Settings pattern)

**Wave 3: Complex pages (High complexity)**
8. Tasks list - 6 hours (kanban + list dual views)
9. Admin pages - 10 hours (5 pages × 2 hours)

**Wave 4: Marketing (Preserve design)**
10. Public pages - 8 hours (4 pages × 2 hours)
11. LandingPage - 4 hours (heavy custom styling)

## Reusable Migration Patterns

### Pattern 1: Import Path Migration

**Before:**
```typescript
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
```

**After:**
```typescript
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Loading';
```

**Automation opportunity:** Write jscodeshift codemod for mechanical import changes.

### Pattern 2: Layout Template Adoption

**Before (Dashboard.tsx):**
```typescript
return (
  <div className="min-h-screen bg-gradient-to-br from-slate-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1>Welcome back, {user?.name}</h1>
      {/* content */}
    </div>
  </div>
);
```

**After:**
```typescript
import { DashboardLayout } from '../../components/ui/patterns';

return (
  <DashboardLayout title={`Welcome back, ${user?.name}`}>
    {/* content */}
  </DashboardLayout>
);
```

**Benefit:** Consistent spacing, responsive behavior, breadcrumbs built-in.

### Pattern 3: Modal Migration (Compound Component)

**Before (legacy Modal):**
```typescript
<Modal isOpen={open} onClose={handleClose} title="Edit Task">
  <div className="p-4">{/* form fields */}</div>
  <div className="flex gap-2">
    <Button onClick={handleSave}>Save</Button>
  </div>
</Modal>
```

**After (design system Modal):**
```typescript
import { Modal } from '../../components/ui/composites/Modal';

<Modal.Root open={open} onOpenChange={setOpen}>
  <Modal.Content>
    <Modal.Header>
      <Modal.Title>Edit Task</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      {/* form fields */}
    </Modal.Body>
    <Modal.Footer>
      <Button onClick={handleSave}>Save</Button>
    </Modal.Footer>
  </Modal.Content>
</Modal.Root>
```

**Breaking change:** API is different, requires refactoring.

### Pattern 4: Domain Component Preservation

**Don't change:**
```typescript
import { StatusBadge, PriorityBadge } from '../../components/ui';
```

**Reason:** These are CogVeri-specific, not generic design system components. They reference domain concepts (task statuses, priority levels) that don't belong in a reusable design system.

## Common Pitfalls

### Pitfall 1: Running Dual Systems Indefinitely
**What goes wrong:** Legacy components never get deleted, bundle size bloats, developers confused about which to use.

**Why it happens:** No hard deadline, "we'll delete later" mentality, fear of breaking something.

**How to avoid:**
- Set hard deadline: "Legacy components deleted by [date]"
- Track migration progress in ROADMAP.md
- Block new PRs that import legacy components (ESLint rule)

**Warning signs:**
- Same component in two locations (ui/Button.tsx and new Button)
- Import paths vary across pages
- Bundle size increasing despite "migration"

### Pitfall 2: Changing Functionality During Migration
**What goes wrong:** Bug is introduced, hard to tell if it's from migration or feature change, rollback difficult.

**Why it happens:** "While we're here" syndrome, temptation to fix bugs or add features.

**How to avoid:**
- VISUAL ONLY rule - no functionality changes
- Separate PRs for migration vs features
- Visual regression tests catch drift

**Warning signs:**
- Migration PR includes business logic changes
- Tests need updating (should be same behavior)
- "Fixed bug while migrating" in commit message

### Pitfall 3: Skipping Visual Regression Tests
**What goes wrong:** Subtle UI differences (1-2px spacing, color shifts) ship to production.

**Why it happens:** Manual QA can't catch small pixel shifts, tests feel slow.

**How to avoid:**
- Playwright screenshot before/after migration
- Automated comparison in CI
- Accept snapshots only after manual review

**Warning signs:**
- "Looks fine to me" without screenshot comparison
- Users report "UI looks different"
- Spacing/alignment issues post-deployment

### Pitfall 4: Deleting Components Too Early
**What goes wrong:** Build breaks because forgotten import somewhere, production broken.

**Why it happens:** Manual grep missed dynamic imports or barrel exports.

**How to avoid:**
- Automate usage detection (`ts-unused-exports`)
- Delete only when usage count is ZERO
- Test full build after deletion

**Warning signs:**
- "Can't find module" errors after deletion
- Forgot to check test files
- Forgot to check Storybook stories

### Pitfall 5: Ignoring Domain-Specific Components
**What goes wrong:** Attempt to "genericize" CogVeri-specific components, waste time, create confusion.

**Why it happens:** Assumption that "all ui/ components should be design system."

**How to avoid:**
- Distinguish design system (generic) from domain (CogVeri-specific)
- Keep StatusBadge, PriorityBadge, VideoPlayer in ui/
- Document why they're NOT part of design system

**Warning signs:**
- Trying to make StatusBadge "more generic"
- Renaming domain concepts to generic terms
- Moving domain logic into design system

## Code Examples

### Example 1: Dashboard Page Migration

**Before (legacy):**
```typescript
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { StatusBadge } from '../../components/ui';

const Dashboard = () => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1>Dashboard</h1>
        {/* content with StatusBadge */}
      </div>
    </div>
  );
};
```

**After (design system):**
```typescript
import { Spinner } from '../../components/ui/Loading';
import { StatusBadge } from '../../components/ui'; // Keep domain-specific
import { DashboardLayout } from '../../components/ui/patterns';

const Dashboard = () => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <DashboardLayout title="Dashboard">
      {/* content with StatusBadge - NO CHANGE */}
    </DashboardLayout>
  );
};
```

**Changes:**
1. `LoadingSpinner` → `Spinner` (rename)
2. Custom layout div → `DashboardLayout` (pattern)
3. `StatusBadge` unchanged (domain-specific)

### Example 2: Modal Migration (Breaking API)

**Before (legacy Modal):**
```typescript
import Modal from '../../components/ui/Modal';

const [isOpen, setIsOpen] = useState(false);

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Create Task"
>
  <form onSubmit={handleSubmit}>
    {/* form fields */}
    <button type="submit">Create</button>
  </form>
</Modal>
```

**After (Radix Modal with compound components):**
```typescript
import { Modal } from '../../components/ui/composites/Modal';

const [isOpen, setIsOpen] = useState(false);

<Modal.Root open={isOpen} onOpenChange={setIsOpen}>
  <Modal.Content>
    <Modal.Header>
      <Modal.Title>Create Task</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      <form onSubmit={handleSubmit}>
        {/* form fields */}
      </form>
    </Modal.Body>
    <Modal.Footer>
      <button type="submit">Create</button>
    </Modal.Footer>
  </Modal.Content>
</Modal.Root>
```

**Changes:**
1. Props API changed: `isOpen`/`onClose` → `open`/`onOpenChange`
2. Structure changed: flat children → compound Header/Body/Footer
3. Focus trap and ESC handling built-in (Radix)

### Example 3: Usage Detection Before Deletion

```bash
# Check if Button.tsx is still imported anywhere
grep -r "from.*components/ui/Button" frontend/src

# Example output (STILL IN USE - don't delete):
frontend/src/pages/auth/Login.tsx:import Button from '../../components/ui/Button';
frontend/src/pages/settings/Billing.tsx:import Button from '../../components/ui/Button';

# Example output (ZERO USAGE - safe to delete):
# (no results)

# Only when grep returns ZERO results:
rm frontend/src/components/ui/Button.tsx
```

## State of the Art

Current migration approaches in React ecosystem:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual find/replace | Automated codemods (jscodeshift) | ~2020 | Safer bulk migrations |
| Manual QA only | Visual regression (Playwright) | ~2021 | Catches pixel-level drift |
| Delete legacy immediately | Delete only after zero usage | Always | Prevents build breaks |
| Generic everything | Domain-specific + generic separation | ~2023 | Clearer boundaries |

**Deprecated/outdated:**
- Big-bang rewrites: Replace incrementally, page-by-page
- Dual systems indefinitely: Set hard deletion deadline
- Generic wrapper mania: Keep domain components domain-specific

## Open Questions

### Question 1: Should Tabs component be rebuilt or kept?
**What we know:**
- Legacy Tabs used in ~5 pages (OrganizationSettings, AdminSettings)
- No design system Tabs component built yet
- Radix Tabs exists as dependency (from Modal work)

**What's unclear:**
- Does existing Tabs API need changes?
- Is usage consistent enough to keep as-is?

**Recommendation:**
- Audit Tabs usage in 5 pages
- If API is consistent, keep legacy Tabs temporarily
- If usage varies, build Radix Tabs wrapper in ui/composites/

### Question 2: What about barrel export index.ts?
**What we know:**
- `frontend/src/components/ui/index.ts` exports legacy components
- Design system has separate barrel exports (patterns/index.ts, composites/index.ts)

**What's unclear:**
- Should ui/index.ts be updated to re-export design system?
- Or should pages import directly from subfolders?

**Recommendation:**
- Update ui/index.ts to re-export design system components
- Allows `import { Button } from '../../components/ui'` to work
- Easier migration (change export source, not all import sites)

### Question 3: How to handle custom stat cards in Dashboard?
**What we know:**
- Dashboard has custom DashboardStatCard components (lines 32-61)
- These are memoized React components with specific gradients
- Not generic enough for design system

**What's unclear:**
- Should these become a pattern component?
- Or remain page-specific?

**Recommendation:**
- Keep as page-specific components in Dashboard.tsx
- Don't abstract until 3+ pages need similar cards
- Follow "don't hand-roll" principle BACKWARDS (don't over-engineer)

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** Direct file inspection of 35 page files, 59 UI component files
- **Existing documentation:** .planning/ROADMAP.md Phase 5 requirements
- **Phase 1-4 completion:** Design system components confirmed built and available

### Secondary (MEDIUM confidence)
- **Migration patterns:** Based on common React migration approaches (codemods, visual regression)
- **Bundle size monitoring:** Phase 1 infrastructure already established

### Tertiary (LOW confidence)
- None - research based on existing codebase artifacts

## Metadata

**Confidence breakdown:**
- Page inventory: HIGH - Direct file inspection, line counts, import analysis
- Design system availability: HIGH - Phases 1-4 COMPLETE artifacts verified
- Migration complexity: MEDIUM - Estimates based on file size, may vary with unknown edge cases
- Domain component classification: MEDIUM - Based on naming and usage, may need adjustment

**Research date:** 2026-01-22
**Valid until:** 30 days (codebase relatively stable, no major refactoring expected)

**Key assumptions:**
1. Design system components from Phases 1-4 are production-ready (confirmed via PLAN.md files)
2. Domain-specific components (VideoPlayer, rubric, recording) remain out of scope (per PROJECT.md)
3. Visual regression infrastructure from Phase 1 is functional
4. Bundle size monitoring from Phase 1 is functional
5. No major feature development during migration period (visual refresh only)

**Open risks:**
- Unknown edge cases in Modal API migration (compound components are new pattern)
- Custom styling in marketing pages may not map cleanly to design system
- Legacy component detection may miss dynamic imports or test-only usage
