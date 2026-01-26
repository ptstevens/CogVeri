---
phase: 04-pattern-components-data-display
plan: 01
subsystem: ui-patterns
tags: [data-table, tanstack-table, pagination, sorting, react]
requires:
  - 02-primitive-components (Badge, Button)
  - 03-composite-components-feedback (Spinner, EmptyState)
provides:
  - DataTable component with server-side pagination and sorting
  - DataTablePagination controls with page size selector
  - DataTableColumnHeader for sortable columns
tech-stack:
  added:
    - "@tanstack/react-table@8.21.3"
  patterns:
    - Headless table library for separation of logic and UI
    - Generic TypeScript components with proper type safety
    - Controlled state pattern for pagination and sorting
    - useMemo for column definitions to prevent re-renders
key-files:
  created:
    - frontend/src/components/ui/patterns/DataTable/DataTable.tsx
    - frontend/src/components/ui/patterns/DataTable/DataTableColumnHeader.tsx
    - frontend/src/components/ui/patterns/DataTable/DataTablePagination.tsx
    - frontend/src/components/ui/patterns/DataTable/index.ts
    - frontend/src/components/ui/patterns/DataTable/DataTable.stories.tsx
  modified:
    - frontend/package.json
    - package-lock.json
decisions:
  - id: tanstack-table-v8
    rationale: "Headless table library provides flexibility without bundle bloat"
  - id: server-side-operations
    rationale: "Manual pagination and sorting for backend-controlled data fetching"
  - id: native-pagination-buttons
    rationale: "Native button elements with Tailwind lighter than custom Button component"
  - id: onchange-fn-type
    rationale: "Use TanStack's OnChangeFn type to support both value and updater patterns"
metrics:
  tasks: 3
  commits: 3
  duration: 4 min
  completed: 2026-01-22
---

# Phase 04 Plan 01: DataTable Components Summary

**Data table pattern with TanStack Table for server-side pagination and sorting**

## What Was Built

Created a complete data table system using TanStack Table v8 that supports server-side pagination, sorting, loading states, and custom empty states. The components follow the headless UI pattern, separating table logic from presentation.

### Components Delivered

**DataTable (`DataTable.tsx`)**
- Generic component with full TypeScript support: `DataTable<TData>`
- Props interface with controlled pagination and sorting state
- Uses TanStack Table's `useReactTable` hook with manual pagination/sorting modes
- Semantic HTML table structure (`<table>`, `<thead>`, `<tbody>`)
- Loading state shows centered Spinner component
- Empty state shows custom content or default "No results" message
- Design token styling: gray-50 headers, gray-100 row borders, hover:bg-gray-50
- Container with rounded-lg border and overflow-hidden

**DataTableColumnHeader (`DataTableColumnHeader.tsx`)**
- Sortable column header with visual indicators
- lucide-react icons: ArrowUpDown (unsorted), ArrowUp (asc), ArrowDown (desc)
- Click handler via `column.getToggleSortingHandler()`
- Conditional rendering: plain text if not sortable, button if sortable
- Hover state with text-gray-900 transition

**DataTablePagination (`DataTablePagination.tsx`)**
- Flex layout with page size selector on left, navigation on right
- Native select element for page size (default options: 10, 20, 50, 100)
- Page indicator: "Page X of Y"
- Navigation buttons: first, previous, next, last (lucide-react icons)
- Disabled states: first/previous when pageIndex === 0, next/last when at end
- Design token styling with hover states and focus rings

**Storybook Documentation (`DataTable.stories.tsx`)**
- Default: Basic table with user data and status badges
- WithPagination: Client-side pagination with controls (5 items per page)
- WithSorting: Sortable name and email columns with state management
- Loading: Loading state with spinner
- Empty: Custom EmptyState component with action button
- FullExample: Combined pagination and sorting demonstrating full capabilities

### Technical Implementation

**TanStack Table Integration**
- Installed `@tanstack/react-table@8.21.3`
- Used `useReactTable` hook with `getCoreRowModel()`
- Manual modes: `manualPagination: true` when pageCount provided, `manualSorting: true` when onSortingChange provided
- `flexRender` for type-safe cell and header rendering

**Type Safety**
- `OnChangeFn<PaginationState>` and `OnChangeFn<SortingState>` types from TanStack Table
- Supports both direct value updates and updater functions
- Generic `DataTable<TData>` component works with any data type
- Exported all prop types for consumer use

**Column Definition Pattern**
- Stories use `useMemo` to define columns (prevents infinite re-renders)
- Columns support both static headers and render functions
- Cell renderers access row data with `row.getValue()`
- Example: Status column renders Badge with conditional variant

**State Management Pattern**
- Controlled components: parent manages pagination and sorting state
- Callbacks use TanStack's updater pattern: `(prev) => ({ ...prev, pageIndex })`
- Server-side pattern: parent fetches data based on state changes

## Decisions Made

**TanStack Table v8** (vs Material React Table, React Table v7)
- Headless library provides flexibility without dictating UI
- No bundle size bloat from pre-built components
- Active maintenance and TypeScript-first design
- Decision tracked in 04-RESEARCH.md

**Server-Side Operations** (manual pagination/sorting)
- Designed for backend-controlled data fetching
- Parent component responsible for API calls based on state
- Table only manages display, not data operations
- Scales to large datasets without client-side performance issues

**Native Pagination Buttons** (vs Button component)
- Lighter implementation for simple icon-only buttons
- Design tokens applied via Tailwind classes
- Reduced component nesting
- Consistent disabled states and hover effects

**OnChangeFn Type** (vs simple callback)
- TanStack Table callbacks can receive updater functions
- Type safety ensures correct implementation
- Supports both patterns: `setState(newValue)` and `setState(prev => newValue)`

## Deviations from Plan

None - plan executed exactly as written.

## Testing & Verification

**TypeScript Compilation**
- All files pass `npx tsc --noEmit` with no errors
- Proper generic types preserved throughout component tree
- TanStack Table types integrated correctly

**Storybook Stories**
- 6 stories covering all states and usage patterns
- Interactive controls for pagination and sorting
- Sample data with 10 users, varied roles and statuses
- Badge components demonstrate cell customization

**Component Structure**
- All files created in `frontend/src/components/ui/patterns/DataTable/`
- Barrel export in `index.ts` exposes all components and types
- File count: 5 files (3 components, 1 stories, 1 index)

**Package Verification**
- `@tanstack/react-table@8.21.3` installed successfully
- No dependency conflicts
- Version confirmed via `npm list`

## Integration Points

**Depends On:**
- Badge component (02-02) for status indicators in stories
- Spinner component (02-01) for loading state
- EmptyState component (03-03) for empty state
- Design tokens (01-01) for all color values

**Provides For:**
- 04-02: List pages will use DataTable for task list, recording list
- 04-03: Admin pages will use DataTable for user management, organization list
- Future: Any page requiring tabular data display

**API Contract:**
```typescript
interface ServerSidePaginationExample {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);

  // Fetch data when pagination/sorting changes
  const { data, isLoading } = useQuery({
    queryKey: ['users', pagination, sorting],
    queryFn: () => api.getUsers({
      page: pagination.pageIndex,
      pageSize: pagination.pageSize,
      sortBy: sorting[0]?.id,
      sortOrder: sorting[0]?.desc ? 'desc' : 'asc'
    })
  });

  <DataTable
    columns={columns}
    data={data?.items ?? []}
    pageCount={data?.totalPages}
    pagination={pagination}
    onPaginationChange={setPagination}
    sorting={sorting}
    onSortingChange={setSorting}
    isLoading={isLoading}
  />
  <DataTablePagination
    pageIndex={pagination.pageIndex}
    pageSize={pagination.pageSize}
    pageCount={data?.totalPages ?? 0}
    onPageChange={(index) => setPagination(prev => ({ ...prev, pageIndex: index }))}
    onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })}
  />
}
```

## Known Limitations

**No Built-in Filtering**
- Plan scoped to pagination and sorting only
- Filtering UI can be added as separate component if needed
- TanStack Table supports filtering via `columnFilters` state

**No Row Selection**
- Checkbox column for multi-select not included
- Can be added later using TanStack Table's `rowSelection` state
- Common pattern for bulk actions

**No Expanded Rows**
- Nested/expandable rows not implemented
- TanStack Table supports via `expanded` state
- Consider for future enhancement if needed

**Client-Side Operations in Stories**
- Stories use client-side sort/pagination for demo purposes
- Production use should be server-side (as designed)
- Stories serve as reference implementation

## Next Phase Readiness

**Phase 4 Progress: 1/3 plans complete**
- ✅ 04-01: DataTable components (complete)
- ⬜ 04-02: List pages (tasks, recordings)
- ⬜ 04-03: Admin pages (users, organizations)

**Blockers:** None

**Recommendations:**
1. Test DataTable with real API data in 04-02
2. Create reusable column definitions for common data types (date, status, actions)
3. Consider skeleton loading state (alternative to spinner for table rows)
4. Document pagination/sorting query parameter conventions for backend

**Technical Debt:**
- None introduced - clean implementation following all patterns

## Lessons Learned

**TanStack Table Pitfalls Avoided:**
1. ✅ Column definitions in useMemo (prevents infinite re-renders)
2. ✅ OnChangeFn type for callbacks (supports updater pattern)
3. ✅ Manual pagination/sorting modes (explicit server-side control)
4. ✅ flexRender for type safety (no as any casts)

**Design Token Usage:**
- All colors use gray scale tokens: gray-50, gray-100, gray-200, gray-400, gray-500, gray-900
- Consistent with rest of design system
- Primary color used in focus rings (primary-500)

**Component Composition:**
- DataTable and DataTablePagination are separate (not compound components)
- Allows flexible layouts (pagination above/below/both)
- Parent manages shared state (pagination object)

## Files Changed

**Created (5):**
- `frontend/src/components/ui/patterns/DataTable/DataTable.tsx` (177 lines)
- `frontend/src/components/ui/patterns/DataTable/DataTableColumnHeader.tsx` (70 lines)
- `frontend/src/components/ui/patterns/DataTable/DataTablePagination.tsx` (178 lines)
- `frontend/src/components/ui/patterns/DataTable/index.ts` (8 lines)
- `frontend/src/components/ui/patterns/DataTable/DataTable.stories.tsx` (415 lines)

**Modified (2):**
- `frontend/package.json` (added @tanstack/react-table dependency)
- `package-lock.json` (dependency tree update)

**Total:** 848 lines of new code (components + stories)

## Commit History

| Commit | Message | Files |
|--------|---------|-------|
| a90bd2c | feat(04-01): install TanStack Table and create DataTable components | DataTable.tsx, DataTableColumnHeader.tsx, package.json |
| 121e35f | feat(04-01): add DataTablePagination and barrel export | DataTablePagination.tsx, index.ts |
| 1651acb | feat(04-01): create Storybook stories for DataTable | DataTable.stories.tsx |

---

**Execution Time:** 4 minutes
**Status:** ✅ Complete
**Next:** Plan 04-02 (List Pages)
