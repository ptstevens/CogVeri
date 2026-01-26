# Phase 4: Pattern Components & Data Display - Research

**Researched:** 2026-01-21
**Domain:** React 18 data tables, charts, navigation patterns, layout templates
**Confidence:** MEDIUM-HIGH

## Summary

Phase 4 builds organism-level pattern components that power major application pages: data tables, navigation systems, charts, and layout templates. The codebase already uses **Recharts 3.6.0** and **lucide-react** in production, establishing key technology choices. The critical evaluation required is **TanStack Table vs Material React Table** for the data table component.

Key findings:
- **Data Table**: Use TanStack Table v8 (headless, 10-15kb) for maximum flexibility with existing Tailwind design system. Material React Table adds 217kb total (150kb Material-UI dependencies) which violates bundle size discipline (Pitfall 10).
- **Navigation**: Sidebar already implemented with lucide-react icons and collapsible functionality. Breadcrumb navigation needs to be added following WAI-ARIA patterns.
- **Charts**: Continue using Recharts 3.7.0 (already integrated). Lightweight (native SVG), TypeScript support, composable React components for bar/line/pie charts.
- **Icon System**: lucide-react already in use (1,500+ icons, excellent tree-shaking). Consistent with existing Sidebar.tsx implementation.
- **Layouts**: Create DashboardLayout and SettingsLayout templates following established Header + Sidebar + Content structure from existing Layout.tsx.

**Primary recommendation:** Build TanStack Table wrapper component (not Material React Table) to maintain bundle size discipline. Leverage existing Recharts, lucide-react, and layout structure. Add breadcrumb navigation component and formalize layout templates.

## Standard Stack

The established libraries/tools for pattern components and data display in React 18:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | ^8.20.0 | Headless table logic | **Recommended for custom designs**. 10-15kb bundle, framework-agnostic core, server-side ready, 2.6M+ weekly downloads. Powers Material React Table internally. |
| recharts | ^3.7.0 | Chart components | **Already in production** (package.json shows 3.6.0). Native SVG, lightweight, 98.4% TypeScript, composable React components. Released v3.7.0 on 2026-01-21. |
| lucide-react | ^0.545.0 | Icon system | **Already in production**. 1,500+ icons, tree-shaking support, consistent 24x24 grid. Used in existing Sidebar.tsx (Home, ClipboardList, FileSearch icons). |
| react-router-dom | ^6.30.3 | Routing/breadcrumbs | **Already in production**. Provides useLocation hook for breadcrumb generation, NavLink for active states. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | ^5.90.16 | Server state management | **Already integrated**. Pair with TanStack Table for server-side pagination/sorting/filtering. Provides caching, refetching, loading states. |
| react-is | ^3.x | Recharts peer dependency | **Required by Recharts**. Version must match React version for compatibility. |
| clsx / tailwind-merge | ^2.1.1 / ^3.4.0 | Conditional styling | **Already integrated**. For table cell styling, conditional row classes, chart container classes. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table | Material React Table V3 | MRT adds 217kb (67kb table + 150kb Material-UI dependencies). Pre-built UI components are convenient but violate bundle size discipline (Pitfall 10). Only use if migrating entire app to Material-UI. |
| TanStack Table | AG Grid Community | AG Grid is 141kb minified, enterprise-focused. More features but heavier. TanStack Table is lighter, more flexible for custom designs. |
| Recharts | Chart.js + react-chartjs-2 | Chart.js uses Canvas (not SVG), harder to customize, separate React wrapper needed. Recharts is React-native with declarative components. |
| Recharts | Victory Charts | Victory is 200kb+, heavier bundle. Recharts is lighter with similar composability. |
| lucide-react | react-icons (aggregator) | react-icons provides 50,000+ icons from multiple sets but imports can be confusing (different icon sets have different styles). lucide-react is consistent 24x24 grid design. |
| lucide-react | heroicons | heroicons has 292 icons vs lucide-react's 1,500+. Smaller collection may require mixing libraries later. lucide-react already in codebase. |

**Installation:**
```bash
# New dependencies needed
npm install @tanstack/react-table

# Already installed (verify versions)
npm list recharts lucide-react react-router-dom @tanstack/react-query

# Recharts peer dependency (match React version)
npm install react-is
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/components/ui/
├── primitives/          # Phase 2 (complete)
│   ├── Button.tsx
│   ├── Input.tsx
│   └── ...
├── composites/          # Phase 3 (complete)
│   ├── Modal/
│   ├── FormField/
│   └── ...
├── patterns/            # Phase 4 (NEW)
│   ├── DataTable/
│   │   ├── DataTable.tsx         # TanStack Table wrapper
│   │   ├── DataTablePagination.tsx
│   │   ├── DataTableColumnHeader.tsx
│   │   ├── DataTable.stories.tsx
│   │   └── index.ts
│   ├── Navigation/
│   │   ├── Breadcrumbs.tsx
│   │   ├── Breadcrumbs.stories.tsx
│   │   └── index.ts
│   │   # Note: Sidebar.tsx already exists in layout/
│   ├── Charts/
│   │   ├── BarChart.tsx          # Recharts wrapper
│   │   ├── LineChart.tsx
│   │   ├── PieChart.tsx
│   │   ├── Charts.stories.tsx
│   │   └── index.ts
│   └── Layouts/
│       ├── DashboardLayout.tsx
│       ├── SettingsLayout.tsx
│       ├── Layouts.stories.tsx
│       └── index.ts
└── index.ts             # Barrel exports
```

### Pattern 1: TanStack Table with Server-Side Control

**What:** Headless table instance with manual pagination/sorting/filtering state for server-side control

**When to use:** Data tables where backend API handles filtering, sorting, pagination (reduces client-side memory for large datasets)

**Example:**
```typescript
// Source: TanStack Table official docs - Manual Pagination guide
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  PaginationState,
  SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pageCount: number;
  onPaginationChange: (pagination: PaginationState) => void;
  onSortingChange: (sorting: SortingState) => void;
  isLoading?: boolean;
}

function DataTable<TData>({
  columns,
  data,
  pageCount,
  onPaginationChange,
  onSortingChange,
  isLoading,
}: DataTableProps<TData>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: (updater) => {
      const newPagination = typeof updater === 'function'
        ? updater(pagination)
        : updater;
      setPagination(newPagination);
      onPaginationChange(newPagination);
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function'
        ? updater(sorting)
        : updater;
      setSorting(newSorting);
      onSortingChange(newSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true, // Server handles pagination
    manualSorting: true,    // Server handles sorting
  });

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {header.isPlaceholder ? null : (
                    <div
                      className={
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none flex items-center gap-2'
                          : ''
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <span>
                          {{
                            asc: '↑',
                            desc: '↓',
                          }[header.column.getIsSorted() as string] ?? '↕'}
                        </span>
                      )}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-4 text-center text-gray-500"
              >
                Loading...
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-4 text-center text-gray-500"
              >
                No results found
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

### Pattern 2: Recharts Composable Chart

**What:** Declarative chart components using Recharts' composable API with design token colors

**When to use:** Dashboard metrics, analytics displays, data visualization (bar, line, pie charts)

**Example:**
```typescript
// Source: Recharts v3.7.0 GitHub README + official examples
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface BaseChartProps {
  data: ChartData[];
  height?: number;
}

// Bar Chart with primary color
function BarChartComponent({ data, height = 300 }: BaseChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-gray-200))" />
        <XAxis
          dataKey="name"
          tick={{ fill: 'rgb(var(--color-gray-600))' }}
        />
        <YAxis tick={{ fill: 'rgb(var(--color-gray-600))' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid rgb(var(--color-gray-200))',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Bar
          dataKey="value"
          fill="rgb(var(--color-primary-600))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Line Chart with primary + accent colors
function LineChartComponent({ data, height = 300 }: BaseChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-gray-200))" />
        <XAxis
          dataKey="name"
          tick={{ fill: 'rgb(var(--color-gray-600))' }}
        />
        <YAxis tick={{ fill: 'rgb(var(--color-gray-600))' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid rgb(var(--color-gray-200))',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="value"
          stroke="rgb(var(--color-primary-600))"
          strokeWidth={2}
          dot={{ fill: 'rgb(var(--color-primary-600))' }}
        />
        <Line
          type="monotone"
          dataKey="value2"
          stroke="rgb(var(--color-accent-500))"
          strokeWidth={2}
          dot={{ fill: 'rgb(var(--color-accent-500))' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Pie Chart with color scale
function PieChartComponent({ data, height = 300 }: BaseChartProps) {
  const COLORS = [
    'rgb(var(--color-primary-600))',
    'rgb(var(--color-primary-400))',
    'rgb(var(--color-accent-500))',
    'rgb(var(--color-accent-400))',
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="rgb(var(--color-primary-600))"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 3: Breadcrumb Navigation with React Router

**What:** WAI-ARIA compliant breadcrumb navigation using react-router-dom's useLocation

**When to use:** Multi-level page hierarchies (Settings > Organization > Members)

**Example:**
```typescript
// Source: Material-UI Breadcrumbs + React Router patterns
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface Breadcrumb {
  label: string;
  href: string;
}

function Breadcrumbs() {
  const location = useLocation();

  // Generate breadcrumbs from pathname
  const pathnames = location.pathname.split('/').filter((x) => x);

  const breadcrumbs: Breadcrumb[] = pathnames.map((name, index) => {
    const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
    return {
      label: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
      href: routeTo,
    };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <ol className="flex items-center space-x-2">
        {/* Home link */}
        <li>
          <Link
            to="/dashboard"
            className="flex items-center text-gray-500 hover:text-primary-600 transition"
            aria-label="Home"
          >
            <Home className="w-4 h-4" />
          </Link>
        </li>

        {/* Breadcrumb trail */}
        {breadcrumbs.map((breadcrumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={breadcrumb.href} className="flex items-center">
              <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
              {isLast ? (
                <span
                  className="text-gray-900 font-medium"
                  aria-current="page"
                >
                  {breadcrumb.label}
                </span>
              ) : (
                <Link
                  to={breadcrumb.href}
                  className="text-gray-500 hover:text-primary-600 transition"
                >
                  {breadcrumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

### Pattern 4: Layout Templates with Compound Components

**What:** Reusable page layout templates (DashboardLayout, SettingsLayout) with consistent structure

**When to use:** Major page sections that share header, sidebar, content area structure

**Example:**
```typescript
// Source: Existing Layout.tsx + MUI Dashboard Layout patterns
import { ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
}

// Dashboard Layout - Full sidebar + content
function DashboardLayout({ children, title, breadcrumbs, actions }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        {/* Page header */}
        {(title || breadcrumbs || actions) && (
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            {breadcrumbs && <div className="mb-2">{breadcrumbs}</div>}
            <div className="flex items-center justify-between">
              {title && <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>}
              {actions && <div className="flex items-center gap-3">{actions}</div>}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// Settings Layout - Two-column with settings nav
function SettingsLayout({ children, title }: LayoutProps) {
  const settingsNav = [
    { name: 'General', href: '/settings/general' },
    { name: 'Team', href: '/settings/team' },
    { name: 'Billing', href: '/settings/billing' },
    { name: 'Security', href: '/settings/security' },
  ];

  return (
    <DashboardLayout title={title}>
      <div className="grid grid-cols-12 gap-6">
        {/* Settings sidebar */}
        <aside className="col-span-3">
          <nav className="space-y-1">
            {settingsNav.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="block px-4 py-2 text-sm rounded-lg hover:bg-gray-100 transition"
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Settings content */}
        <div className="col-span-9">
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}

export { DashboardLayout, SettingsLayout };
```

### Anti-Patterns to Avoid

- **Client-side pagination for large datasets:** Don't load 10,000 rows and paginate in browser. Use `manualPagination: true` and fetch pages from API. Memory issues, slow initial load.
- **Hardcoded chart colors:** Never use hex colors in Recharts components. Use `rgb(var(--color-primary-600))` to reference design tokens. Ensures color consistency.
- **Missing ARIA labels on navigation:** Breadcrumbs need `aria-label="Breadcrumb"`, current page needs `aria-current="page"`. Screen reader accessibility.
- **Layout without responsive design:** Test layouts on mobile/tablet. Sidebar should collapse to hamburger menu on small screens.
- **Table without loading/empty states:** Always show skeleton or spinner during loading, empty state when no data. Prevents layout shift.
- **Non-sortable column header without visual indicator:** If column is sortable, show sort icon. If not sortable, don't show hover state. Clear affordance.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table column sorting logic | Custom sort functions per column | TanStack Table `getSortedRowModel()` | Handles string/number/date sorting, null values, multi-column sort, sort direction toggling. Edge cases: case-insensitive string sort, undefined handling. |
| Table pagination state | Manual page state + slice logic | TanStack Table `getPaginationRowModel()` with `manualPagination` | Manages pageIndex, pageSize, pageCount, boundary checking (first/last page). Edge cases: dynamic page size, total count from server. |
| Chart responsiveness | Manual resize observers | Recharts `ResponsiveContainer` | Listens to container resize, recalculates chart dimensions, handles debouncing. Edge cases: flexbox containers, hidden tabs. |
| Breadcrumb path generation | Manual string splitting + routing | react-router-dom `useLocation()` + path mapping | Parses pathname, generates hierarchy, handles special characters. Edge cases: dynamic route params, nested routes. |
| Icon tree-shaking | Importing entire icon library | lucide-react individual imports: `import { Home } from 'lucide-react'` | ES6 module imports enable bundler tree-shaking. Only imported icons in final bundle. Edge cases: dynamic icon selection (use icon map). |
| Table accessibility | Manual ARIA attributes | TanStack Table + semantic HTML `<table>`, `<th>`, `<td>` | Browsers provide built-in table semantics. Add `aria-sort`, `aria-label`, `aria-rowcount` for enhanced accessibility. Edge cases: virtualized tables (lose native semantics). |

**Key insight:** Data tables are deceptively complex. Sorting, filtering, pagination, and row selection each have 50+ edge cases (null handling, type coercion, state synchronization). TanStack Table is battle-tested with 2.6M+ weekly downloads. Building custom table logic leads to bugs discovered in production months later (sorting breaks with null values, pagination breaks on last page with 1 item, etc.).

## Common Pitfalls

### Pitfall 1: Unstable Table References Causing Infinite Re-renders

**What goes wrong:** Passing `data` or `columns` to `useReactTable` without memoization causes infinite render loop. Component re-renders, creates new array/object, TanStack Table detects change, triggers re-render.

**Why it happens:** React's referential equality check. `[{id: 1}] !== [{id: 1}]` even if values are identical. TanStack Table uses data reference to detect changes.

**How to avoid:**
```typescript
// BAD: Creates new array every render
const data = users.map(u => ({ id: u.id, name: u.name }));

// GOOD: Memoize with useMemo
const data = useMemo(
  () => users.map(u => ({ id: u.id, name: u.name })),
  [users]
);

// GOOD: Or use stable reference from React Query
const { data } = useQuery(['users'], fetchUsers); // Already memoized
```

**Warning signs:**
- Browser DevTools shows 100+ renders per second
- React DevTools Profiler shows constant re-renders
- Console log in table component fires infinitely

### Pitfall 2: Server-Side Pagination Without Page Count

**What goes wrong:** Setting `manualPagination: true` but not providing `pageCount`. Next/previous buttons are disabled, or user can paginate beyond available data.

**Why it happens:** TanStack Table doesn't know total pages when pagination is manual. Assumes infinite pages if `pageCount` is undefined.

**How to avoid:**
```typescript
// API response should include total count
interface ApiResponse {
  data: User[];
  total: number; // Total items
  page: number;
  pageSize: number;
}

const pageCount = Math.ceil(total / pageSize);

const table = useReactTable({
  data,
  columns,
  pageCount, // Required for manual pagination
  manualPagination: true,
  // ...
});
```

**Warning signs:**
- Next page button always enabled (infinite pagination)
- Page X of Y shows "Page 1 of -1" or "Page 1 of Infinity"
- User navigates to page with no data

### Pitfall 3: Chart Colors Not Using Design Tokens

**What goes wrong:** Recharts components use hardcoded hex colors like `fill="#0D9488"` instead of CSS variables. Color changes require find-replace across all chart components.

**Why it happens:** Recharts examples show hex colors for simplicity. Developers copy-paste without adapting to design system.

**How to avoid:**
```typescript
// BAD: Hardcoded hex color
<Bar fill="#0D9488" />

// GOOD: CSS variable reference
<Bar fill="rgb(var(--color-primary-600))" />

// BETTER: Centralized color config
const CHART_COLORS = {
  primary: 'rgb(var(--color-primary-600))',
  accent: 'rgb(var(--color-accent-500))',
  success: 'rgb(var(--color-success-500))',
};

<Bar fill={CHART_COLORS.primary} />
```

**Warning signs:**
- Chart colors don't match rest of app
- Design system color change doesn't affect charts
- Different shades of "primary" used across charts

### Pitfall 4: Breadcrumbs Without Accessible Markup

**What goes wrong:** Breadcrumbs built with divs and spans instead of `<nav>` and `<ol>`. Screen readers don't announce navigation structure, no keyboard navigation.

**Why it happens:** Visual-only implementation. Developers style breadcrumbs correctly but miss semantic HTML and ARIA.

**How to avoid:**
```typescript
// BAD: Non-semantic markup
<div className="breadcrumbs">
  <span>Home</span> / <span>Settings</span>
</div>

// GOOD: Semantic HTML + ARIA
<nav aria-label="Breadcrumb">
  <ol className="flex items-center">
    <li><a href="/home">Home</a></li>
    <li><a href="/settings">Settings</a></li>
    <li aria-current="page">Team</li>
  </ol>
</nav>
```

**Warning signs:**
- Lighthouse accessibility audit flags breadcrumbs
- Screen reader doesn't announce "navigation" landmark
- Current page not announced as "current page"

### Pitfall 5: Table Without Loading and Empty States

**What goes wrong:** Table shows no feedback during data fetch. User sees empty table body, unsure if loading or no data. Layout shifts when data arrives.

**Why it happens:** Happy-path development. Tests with instant data loads, doesn't simulate loading state or empty results.

**How to avoid:**
```typescript
const { data, isLoading, isError } = useQuery(['users'], fetchUsers);

return (
  <DataTable
    columns={columns}
    data={data ?? []}
    isLoading={isLoading}
    emptyState={
      <EmptyState
        icon={Users}
        title="No users found"
        description="Get started by creating your first user"
        action={{ label: 'Add User', onClick: handleAddUser }}
      />
    }
  />
);

// Inside DataTable component:
{isLoading ? (
  <tr><td colSpan={columns.length}><Spinner /></td></tr>
) : data.length === 0 ? (
  <tr><td colSpan={columns.length}>{emptyState}</td></tr>
) : (
  // Render rows
)}
```

**Warning signs:**
- Flash of empty table before data loads
- User confusion: "Is it loading or are there no results?"
- Layout shift when rows appear

### Pitfall 6: Mixing Icon Libraries

**What goes wrong:** Using lucide-react icons in sidebar, heroicons in data table, and Font Awesome in charts. Inconsistent visual weight, size, and style. Bundle includes multiple icon libraries.

**Why it happens:** Copy-pasting components from different sources (shadcn/ui uses lucide-react, Tailwind UI uses heroicons). Developers don't notice the mix.

**How to avoid:**
- **Single source of truth:** lucide-react is already in codebase (Sidebar.tsx uses Home, ClipboardList, etc.)
- Code review checklist: "All icons from lucide-react?"
- Search codebase for other icon imports: `grep -r "from 'heroicons'" src/`
- If icon not available in lucide-react, create custom SVG icon component instead of adding new library

**Warning signs:**
- Sort icons in table look different from sidebar icons
- Multiple icon libraries in bundle (check with `npm ls` or bundle analyzer)
- Icons have inconsistent spacing/sizing

## Code Examples

Verified patterns from official sources and existing codebase:

### TanStack Table with React Query Integration
```typescript
// Source: TanStack Table + TanStack Query official examples
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table';
import { useState, useMemo } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UsersResponse {
  data: User[];
  total: number;
}

function UsersTable() {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState([]);

  // Fetch data with React Query
  const { data, isLoading } = useQuery({
    queryKey: ['users', pagination, sorting],
    queryFn: () =>
      fetch(
        `/api/users?page=${pagination.pageIndex}&size=${pagination.pageSize}&sort=${JSON.stringify(sorting)}`
      ).then((res) => res.json()),
    keepPreviousData: true, // Prevent empty state between pages
  });

  // Memoize columns to prevent re-renders
  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: 'email',
        header: 'Email',
      },
      {
        accessorKey: 'role',
        header: 'Role',
      },
    ],
    []
  );

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    pageCount: Math.ceil((data?.total ?? 0) / pagination.pageSize),
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <div>
      <DataTable table={table} isLoading={isLoading} />
      <DataTablePagination table={table} />
    </div>
  );
}
```

### Recharts with Accessibility
```typescript
// Source: Recharts v3.7.0 GitHub + accessibility wiki
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartData {
  month: string;
  tasks: number;
}

function TasksChart({ data }: { data: ChartData[] }) {
  return (
    <div
      role="img"
      aria-label="Monthly tasks chart showing task completion over time"
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          accessibilityLayer // NEW in Recharts 3.0: Adds ARIA labels, roles, keyboard controls
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-gray-200))" />
          <XAxis
            dataKey="month"
            tick={{ fill: 'rgb(var(--color-gray-600))' }}
            aria-label="Month"
          />
          <YAxis
            tick={{ fill: 'rgb(var(--color-gray-600))' }}
            aria-label="Number of tasks"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid rgb(var(--color-gray-200))',
              borderRadius: '8px',
            }}
          />
          <Bar
            dataKey="tasks"
            fill="rgb(var(--color-primary-600))"
            radius={[4, 4, 0, 0]}
            aria-label="Tasks completed"
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Fallback table for screen readers */}
      <table className="sr-only">
        <caption>Monthly Tasks Data</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.month}>
              <td>{item.month}</td>
              <td>{item.tasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Sidebar with Mini-Drawer State (Existing Pattern)
```typescript
// Source: Existing frontend/src/components/layout/Sidebar.tsx
// Already implemented! Shows collapsible sidebar pattern.
// Icons from lucide-react: Home, ClipboardList, FileSearch, Settings
// Collapses to icon-only (w-24) on desktop, full-width hamburger on mobile

interface SidebarProps {
  isOpen: boolean; // Controls expanded (w-72) vs collapsed (w-24)
  onToggle: () => void;
}

// Key pattern: Conditional width and icon-only mode
<aside className={`hidden lg:flex lg:flex-col transition-all duration-300 ${
  isOpen ? 'w-72' : 'w-24'
}`}>
  <nav>
    {navigation.map((item) => (
      <NavLink
        to={item.href}
        className={`group flex items-center px-4 py-3 ${
          !isOpen && 'lg:justify-center lg:px-2'
        }`}
      >
        <item.icon className={`h-5 w-5 ${isOpen ? 'mr-3' : ''}`} />
        {isOpen && <span>{item.name}</span>}
        {!isOpen && <span className="sr-only">{item.name}</span>}
      </NavLink>
    ))}
  </nav>
</aside>
```

### DashboardLayout with Breadcrumbs
```typescript
// Source: Material-UI Dashboard Layout + existing Layout.tsx
import { ReactNode } from 'react';
import Breadcrumbs from '@/components/ui/patterns/Navigation/Breadcrumbs';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  showBreadcrumbs?: boolean;
  actions?: ReactNode;
}

function DashboardLayout({
  children,
  title,
  showBreadcrumbs = true,
  actions,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        isOpen={sidebarOpen}
        isMobileOpen={mobileSidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onMobileToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        {/* Page header with breadcrumbs */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          {showBreadcrumbs && <Breadcrumbs />}
          <div className="flex items-center justify-between mt-2">
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// Usage:
<DashboardLayout
  title="Team Members"
  actions={
    <Button variant="primary" icon={Plus}>
      Add Member
    </Button>
  }
>
  <UsersTable />
</DashboardLayout>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Table v7 | TanStack Table v8 | 2022 | Renamed to TanStack (framework-agnostic), introduced `useReactTable` hook API, dropped `useTable` legacy API. Breaking change but better TypeScript support. |
| Client-side only tables | Server-side with `manualPagination` | 2020-2026 | Large datasets (10k+ rows) cause memory issues client-side. Server-side pagination is now standard with `manualPagination: true`. |
| Chart.js (Canvas) | Recharts (SVG) | 2018-2026 | SVG enables declarative React components, easier customization, better accessibility. Canvas is faster for 1000+ data points but less common in dashboards. |
| react-icons aggregator | lucide-react single set | 2024-2026 | lucide-react provides consistent 24x24 grid icons. react-icons mixes different icon sets (Font Awesome, Material, etc.) with inconsistent styles. |
| Global sidebar state | Component-level sidebar state | 2023-2026 | Layout component manages own sidebar state (isOpen, onToggle). No need for global context unless sidebar state shared across routes. |
| Recharts v2 | Recharts v3 | 2024-2026 | v3.0 (Oct 2024) added `accessibilityLayer` prop (ARIA labels, keyboard controls), TypeScript rewrite (98.4% TS), React 18 concurrent mode support. |

**Deprecated/outdated:**
- **react-table v7**: Last release 2021. Use TanStack Table v8+ (`@tanstack/react-table`).
- **Material-table**: Unmaintained since 2021. Use TanStack Table or Material React Table.
- **Victory Charts**: Last major update 2022. Recharts has more active development (v3.7.0 released 2026-01-21).
- **heroicons v1**: v2 added outline/solid variants. If using heroicons, use v2+. But lucide-react is already in CogVeri codebase.
- **Manual breadcrumb arrays**: Hardcoding breadcrumb structure is brittle. Use `useLocation()` to generate from pathname.

## Open Questions

Things that couldn't be fully resolved:

1. **Should DataTable support row selection (checkboxes)?**
   - What we know: Requirement PATT-01 mentions "sort, filter, pagination" but not selection
   - What's unclear: Whether bulk actions (delete selected, export selected) are needed in Phase 4
   - Recommendation: Start without row selection. TanStack Table supports it via `getRowSelectionRowModel()` if needed in future. Add when use case emerges (likely in task management UI).

2. **How should table column definitions be shared across pages?**
   - What we know: Multiple pages will have user tables, task tables, recording tables
   - What's unclear: Column definitions co-located with page component or centralized in DataTable pattern?
   - Recommendation: Co-locate initially (columns defined in page component, passed to DataTable). Extract to shared column definitions file if 3+ pages use identical columns (avoid premature abstraction, per Pitfall 12).

3. **Should charts support dark mode?**
   - What we know: Tailwind config shows light colors only (no `dark:` variants in design tokens)
   - What's unclear: Whether dark mode is planned for CogVeri
   - Recommendation: Charts use CSS variables (`rgb(var(--color-primary-600))`). If dark mode added later, update CSS variables and charts will adapt automatically. No dark mode logic needed in chart components.

4. **Should SettingsLayout navigation be dynamic or static?**
   - What we know: Settings pages exist (organization settings, profile, billing per existing routes)
   - What's unclear: Whether settings nav items should be hardcoded or derived from route config
   - Recommendation: Static settings nav array in SettingsLayout component. Dynamic nav is over-engineering unless 10+ settings pages. Current approach in existing Sidebar.tsx is static array.

5. **How to handle chart data loading states?**
   - What we know: Charts receive data prop but no isLoading prop in examples
   - What's unclear: Should charts show skeleton or spinner during data fetch?
   - Recommendation: Parent component wraps chart in loading state. Chart components assume data is ready. Pattern: `{isLoading ? <Skeleton height={300} /> : <BarChart data={data} />}`. Separation of concerns.

## Sources

### Primary (HIGH confidence)
- [TanStack Table v8 Documentation](https://tanstack.com/table/latest) - Official API, manual pagination guide, server-side examples
- [TanStack Table FAQ](https://tanstack.com/table/latest/docs/faq) - Common mistakes, unstable references, performance
- [Recharts GitHub v3.7.0](https://github.com/recharts/recharts) - Current version (released 2026-01-21), TypeScript support, installation
- [Recharts Accessibility Wiki](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility) - `accessibilityLayer` prop, ARIA patterns, screen reader support
- [lucide-react Documentation](https://lucide.dev/guide/packages/lucide-react) - Tree-shaking, individual imports, React component API
- [Material-UI Breadcrumbs](https://mui.com/material-ui/react-breadcrumbs/) - ARIA patterns, semantic HTML, separator usage
- [React Router useLocation](https://reactrouter.com/en/main/hooks/use-location) - Pathname parsing, breadcrumb generation patterns
- Existing codebase:
  - `/frontend/src/components/layout/Sidebar.tsx` - Collapsible sidebar pattern, lucide-react icons
  - `/frontend/src/components/layout/Layout.tsx` - Header + Sidebar + Content structure
  - `/frontend/package.json` - Recharts 3.6.0, lucide-react 0.545.0, @tanstack/react-query 5.90.16

### Secondary (MEDIUM confidence)
- [Medium: Server-Side Pagination with TanStack Table](https://medium.com/@clee080/how-to-do-server-side-pagination-column-filtering-and-sorting-with-tanstack-react-table-and-react-7400a5604ff2) - Manual pagination example, React Query integration
- [Material React Table Bundle Size](https://bundlephobia.com/package/material-react-table) - 217kb total (67kb table + 150kb Material-UI dependencies)
- [React Table Accessibility Best Practices](https://www.simple-table.com/blog/mit-licensed-react-tables-accessibility-keyboard-navigation) - WCAG 2.1 AA standards, ARIA attributes, keyboard navigation
- [Building Responsive Sidebar with MUI Drawer](https://kombai.com/mui/drawer/) - Mini-variant drawer pattern, tooltip support for collapsed states
- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/sidebar) - Collapsible sidebar with SidebarProvider context pattern
- [Improving Recharts Performance](https://belchior.hashnode.dev/improving-recharts-performance-clp5w295y000b0ajq8hu6cnmm) - React.memo, useMemo, useCallback optimization strategies

### Tertiary (LOW confidence - community sources)
- [TanStack Table Discussion #2033: Server-side filtering example](https://github.com/TanStack/table/discussions/2033) - Community implementation (not official)
- [Best React Chart Libraries 2026 - LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/) - Library comparison, opinions on tradeoffs
- [React Icon Libraries Comparison - Medium](https://medium.com/@reactjsbd/top-10-icon-libraries-for-react-development-a-comprehensive-guide-e7b4b6795027) - Bundle size estimates (not verified with bundlephobia)
- [React Dashboard Templates 2026 - MUI](https://mui.com/store/collections/free-react-dashboard/) - Layout pattern inspiration (not authoritative for best practices)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - TanStack Table is industry standard (2.6M+ weekly downloads), Recharts already in production (package.json verified), lucide-react already in use (Sidebar.tsx verified)
- Architecture: **MEDIUM-HIGH** - TanStack Table patterns from official docs (HIGH), Recharts examples from official docs (HIGH), Breadcrumb patterns from community best practices (MEDIUM), Layout patterns based on existing Layout.tsx (HIGH)
- Pitfalls: **MEDIUM** - Unstable references and pagination pitfalls from official TanStack Table FAQ (HIGH), accessibility pitfalls from community sources (MEDIUM), icon mixing is common sense but not documented (LOW)
- Code examples: **HIGH** - TanStack Table examples from official docs, Recharts examples from official docs, Sidebar pattern from existing codebase

**Research date:** 2026-01-21
**Valid until:** 2026-02-21 (30 days - stable ecosystem, TanStack Table v8 and Recharts v3 are mature)

**Notes:**
- **TanStack Table over Material React Table** is strong recommendation due to bundle size (10-15kb vs 217kb). Material-UI dependencies (150kb) violate Pitfall 10 (bundle size creep).
- Recharts and lucide-react are **locked** (already in production), eliminating library evaluation.
- Sidebar pattern **already implemented** in existing Sidebar.tsx with collapsible functionality (isOpen prop toggles width).
- Breadcrumb navigation is **net new** component, high value for settings pages and multi-level hierarchies.
- Layout templates **formalize existing pattern** from Layout.tsx, providing reusable page structure.
- TanStack Table evaluation was **1-2 hour spike** as noted in roadmap research note. Material React Table ruled out due to bundle size, TanStack Table selected for flexibility.
