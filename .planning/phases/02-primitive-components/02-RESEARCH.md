# Phase 2: Primitive Components - Research

**Researched:** 2026-01-21
**Domain:** Atomic design system primitives - Button, Input, Card, Badge, Loading states
**Confidence:** HIGH

## Summary

Phase 2 builds the atomic design system components that become building blocks for all UI. The codebase already has basic components (Button, Input, Card, Select, LoadingSpinner, Modal, StatusBadge) that need enhancement, standardization, and Storybook documentation. The existing patterns are solid but inconsistent in approach - some use variant objects, others inline conditionals.

**Current CogVeri State:**
- Button: Works but uses string concatenation instead of cva(), lacks pressed state
- Input: Good accessibility (aria-invalid, aria-describedby), needs consistency with other inputs
- Card: No variant system despite requirement for 3 variants (default, elevated, outlined)
- Select: Solid implementation with proper accessibility
- LoadingSpinner: Basic, no skeleton or progress bar components
- Badges: StatusBadge and PriorityBadge exist but use different patterns
- No dedicated Avatar, Icon wrapper, or Checkbox components
- No Storybook setup

**Primary recommendation:** Use class-variance-authority (cva) to standardize all component variants, matching the existing cn() utility pattern. Keep building from native elements (no Radix dependency) for this phase - the existing components are close to requirements. Add Storybook 8 with @storybook/react-vite for component documentation.

## Standard Stack

### Core Tools for Phase 2

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| **class-variance-authority** | 0.7.x | Type-safe variant definitions | Industry standard (shadcn/ui), works with existing cn() utility |
| **@storybook/react-vite** | 8.x | Component documentation | Official Storybook framework for Vite, required for PRIM-06 |
| **@storybook/addon-a11y** | 8.x | Accessibility testing in Storybook | Catches WCAG violations during development |
| **@storybook/addon-interactions** | 8.x | Interactive testing | Verify component states in stories |

### Supporting Tools (Already Installed)

| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| **clsx** | 2.1.1 | Conditional className composition | Installed |
| **tailwind-merge** | 3.4.0 | Merge Tailwind classes without conflicts | Installed |
| **lucide-react** | 0.545.0 | Icon library | Installed, already used throughout |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **cva** | tailwind-variants | tailwind-variants: More features (slots, responsive variants). CVA: Simpler, lighter, better TS inference. For primitive components, CVA is sufficient. |
| **Building from scratch** | Radix UI Primitives | Radix: Better accessibility out-of-box for complex components. Building: More control, no dependency. For Phase 2 primitives (Button, Input, Card), native elements with proper ARIA are sufficient. Radix adds value for Phase 3 (Modal, Dropdown). |
| **Storybook 8** | Ladle | Ladle: Faster, simpler. Storybook: Industry standard, better addon ecosystem, automatic docs. Team familiarity favors Storybook. |

**Installation:**
```bash
cd frontend

# Variant system
npm install class-variance-authority

# Storybook (will prompt for options)
npx storybook@latest init --builder @storybook/builder-vite

# Accessibility addon
npm install -D @storybook/addon-a11y
```

## Architecture Patterns

### Recommended Component Structure

```
frontend/src/components/ui/
├── Button/
│   ├── Button.tsx           # Component implementation
│   ├── Button.stories.tsx   # Storybook stories
│   ├── Button.test.tsx      # Unit tests
│   └── index.ts             # Re-export
├── Input/
│   ├── Input.tsx
│   ├── Input.stories.tsx
│   ├── Input.test.tsx
│   └── index.ts
├── Card/
│   ├── Card.tsx
│   ├── Card.stories.tsx
│   ├── Card.test.tsx
│   └── index.ts
├── Badge/
│   ├── Badge.tsx
│   ├── Badge.stories.tsx
│   ├── Badge.test.tsx
│   └── index.ts
├── Avatar/
│   ├── Avatar.tsx
│   ├── Avatar.stories.tsx
│   └── index.ts
├── Checkbox/
│   ├── Checkbox.tsx
│   ├── Checkbox.stories.tsx
│   └── index.ts
├── Icon/
│   ├── Icon.tsx
│   ├── Icon.stories.tsx
│   └── index.ts
├── Loading/
│   ├── Spinner.tsx
│   ├── Progress.tsx
│   ├── Skeleton.tsx
│   ├── Loading.stories.tsx
│   └── index.ts
└── index.ts                 # Barrel export all components
```

**Rationale:** Co-locating stories with components ensures documentation stays updated. The existing flat structure (`Button.tsx`, `Button.test.tsx`) can be migrated incrementally - start with new components in folders, migrate existing later.

### Pattern 1: CVA Variant Definition

**What:** Use class-variance-authority for type-safe variant props
**When to use:** Any component with multiple visual variants (size, color, state)

**Example:**
```typescript
// Source: https://cva.style/docs/getting-started/variants
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base classes - always applied
  [
    'inline-flex items-center justify-center',
    'font-medium rounded-lg',
    'transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:ring-offset-1',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary-600 text-white',
          'hover:bg-primary-700',
          'active:bg-primary-800',
          'focus:ring-primary-500',
        ],
        secondary: [
          'bg-white text-gray-700',
          'border border-gray-300',
          'hover:bg-gray-50 hover:text-gray-900',
          'active:bg-gray-100',
          'focus:ring-gray-200',
        ],
        danger: [
          'bg-error-600 text-white',
          'hover:bg-error-700',
          'active:bg-error-800',
          'focus:ring-error-500',
        ],
        ghost: [
          'bg-transparent text-gray-600',
          'hover:bg-gray-100 hover:text-gray-900',
          'active:bg-gray-200',
          'focus:ring-gray-500',
          'shadow-none',
        ],
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

// Export type for consumers
export type ButtonVariants = VariantProps<typeof buttonVariants>;
```

**Why this pattern:**
- Type-safe: TypeScript infers variant options automatically
- Consistent: Same pattern for all components
- Composable: Works with existing cn() utility
- Maintainable: Variants defined in one place, not scattered through component

### Pattern 2: Focus-Visible for Keyboard Navigation

**What:** Use `:focus-visible` instead of `:focus` for keyboard-only focus rings
**When to use:** All interactive components (Button, Input, Checkbox, etc.)

**Example:**
```typescript
// Tailwind classes for focus states
const focusClasses = [
  'focus:outline-none',
  'focus-visible:ring-2',
  'focus-visible:ring-primary-500',
  'focus-visible:ring-offset-1',
];
```

**Why this pattern:**
- Users clicking buttons don't see focus ring (cleaner UX)
- Keyboard navigators see clear focus indicator (accessibility)
- Built into browsers, no JavaScript needed

### Pattern 3: Compound Variants for State Combinations

**What:** Apply styles when multiple conditions are met
**When to use:** Interactive states that depend on multiple props

**Example:**
```typescript
// Source: https://cva.style/docs/getting-started/variants
compoundVariants: [
  // Primary + Loading gets lighter hover
  {
    variant: 'primary',
    isLoading: true,
    class: 'hover:bg-primary-600', // No hover change when loading
  },
  // Danger + Disabled gets muted appearance
  {
    variant: 'danger',
    disabled: true,
    class: 'bg-error-300',
  },
],
```

### Pattern 4: Accessible Form Inputs

**What:** Proper ARIA attributes and label associations
**When to use:** All form inputs (Input, Select, Checkbox)

**Example:**
```typescript
// Existing Input.tsx pattern - PRESERVE this
const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helpText,
  id,
  ...props
}, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const helpTextId = `${inputId}-help`;

  return (
    <div>
      {label && (
        <label htmlFor={inputId}>{label}</label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : helpText ? helpTextId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert">{error}</p>
      )}
      {helpText && !error && (
        <p id={helpTextId}>{helpText}</p>
      )}
    </div>
  );
});
```

**Why this pattern:**
- Screen readers announce error messages
- Labels properly associated via htmlFor/id
- WCAG 2.2 AA compliant

### Anti-Patterns to Avoid

- **Dynamic class construction:** Never use `` `bg-${color}-500` `` - ESLint catches this (Pitfall 12 in roadmap)
- **Component definition inside render:** Never define components inside other components (Pitfall 7 - ESLint catches)
- **Over-engineering abstractions:** Start with 2-3 real use cases before abstracting (Pitfall 12 in roadmap)
- **Inline styles for things Tailwind handles:** Use design tokens via Tailwind, not inline styles

## Don't Hand-Roll

Problems with existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Variant type safety** | Manual TypeScript union types | CVA `VariantProps<typeof variants>` | Automatic inference, stays in sync |
| **Class merging** | String concatenation | `cn()` utility (already exists) | Handles conflicts, undefined values |
| **Icon wrapper** | Custom SVG loading | lucide-react (already installed) | Tree-shakeable, consistent sizing, TypeScript types |
| **Skeleton animation** | Custom keyframes | Tailwind `animate-pulse` | Built-in, optimized, consistent |
| **Focus management** | Manual `:focus` states | `:focus-visible` pseudo-class | Browser-native, keyboard-only |

**Key insight:** The existing codebase is 80% there. Most work is standardization and documentation, not new invention. Use existing patterns where they work well (Input accessibility, LoadingSpinner), enhance where needed (Button states, Card variants).

## Common Pitfalls

### Pitfall 1: Forgetting Pressed State (Requirements Say 5 States)

**What goes wrong:** Button has enabled, disabled, hover, focus but missing pressed/active state. Requirements explicitly list 5 states.

**Why it happens:** Active/pressed state often overlooked in Tailwind (need `:active` pseudo-class)

**How to avoid:**
1. Use Tailwind `active:` prefix for pressed state
2. Active state should be slightly darker than hover
3. Test by clicking and holding button

**Example:**
```typescript
variant: {
  primary: [
    'bg-primary-600',           // enabled
    'hover:bg-primary-700',     // hover
    'active:bg-primary-800',    // pressed
    'focus-visible:ring-2',     // focus
    'disabled:opacity-50',      // disabled
  ],
}
```

**Warning signs:**
- Component only has 4 interaction states
- No `active:` classes in component

### Pitfall 2: Card Variants Missing from Existing Component

**What goes wrong:** Current Card.tsx has no `variant` prop. Requirements say "at least 3 variants (default, elevated, outlined)."

**Why it happens:** Original Card was built for single use case, not design system

**How to avoid:**
1. Add CVA variant system to Card
2. Default: current appearance (subtle shadow, border)
3. Elevated: stronger shadow, no border
4. Outlined: no shadow, visible border

**Example:**
```typescript
const cardVariants = cva(
  'bg-white rounded-xl overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border border-gray-200 shadow-sm',
        elevated: 'shadow-lg',
        outlined: 'border-2 border-gray-200',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);
```

### Pitfall 3: Checkbox Not Using Native Input

**What goes wrong:** Building custom checkbox with divs and ARIA instead of native `<input type="checkbox">`

**Why it happens:** Desire for custom styling leads to over-engineering

**How to avoid:**
1. Use native `<input type="checkbox">` with `appearance-none`
2. Style with Tailwind peer selector for custom visuals
3. Gets native keyboard support, form integration for free

**Example:**
```typescript
// Good: Native input with custom styling
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="peer sr-only"
    checked={checked}
    onChange={onChange}
  />
  <div className="
    w-5 h-5 rounded border-2 border-gray-300
    peer-checked:bg-primary-600 peer-checked:border-primary-600
    peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500
  ">
    {/* Check icon */}
  </div>
  <span>{label}</span>
</label>
```

**Warning signs:**
- Using `role="checkbox"` on a div
- Managing checked state in component when it should be controlled
- Missing keyboard support

### Pitfall 4: Skeleton Components Without Consistent Animation

**What goes wrong:** Multiple skeleton components with different pulse animations, inconsistent appearance

**Why it happens:** Each skeleton built independently, no shared system

**How to avoid:**
1. Create base Skeleton component with `animate-pulse`
2. Build SkeletonText, SkeletonCircle, SkeletonCard on top
3. Use consistent gray colors (`bg-gray-200`)

**Example:**
```typescript
// Base skeleton with consistent animation
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse bg-gray-200 rounded', className)} />
);

// Composed variants
const SkeletonText = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={cn('h-4', i === lines - 1 && 'w-3/4')}
      />
    ))}
  </div>
);
```

### Pitfall 5: Storybook Stories Without Accessibility Tab

**What goes wrong:** Stories exist but accessibility issues not visible during development

**Why it happens:** `@storybook/addon-a11y` not installed or configured

**How to avoid:**
1. Install @storybook/addon-a11y in Phase 2 setup
2. Configure in `.storybook/main.ts`
3. Every story automatically gets accessibility audit

**Configuration:**
```typescript
// .storybook/main.ts
const config: StorybookConfig = {
  addons: [
    '@storybook/addon-a11y',
    // ... other addons
  ],
};
```

## Code Examples

### Button with CVA (Migrating Existing)

```typescript
// frontend/src/components/ui/Button/Button.tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from '../Loading';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium rounded-lg',
    'transition-all duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'shadow-sm',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary-600 text-white border border-transparent',
          'hover:bg-primary-700 hover:shadow-md',
          'active:bg-primary-800',
          'focus-visible:ring-primary-500',
        ],
        secondary: [
          'bg-white text-gray-700 border border-gray-300',
          'hover:bg-gray-50 hover:text-gray-900',
          'active:bg-gray-100',
          'focus-visible:ring-gray-200',
        ],
        danger: [
          'bg-error-600 text-white border border-transparent',
          'hover:bg-error-700',
          'active:bg-error-800',
          'focus-visible:ring-error-500',
        ],
        ghost: [
          'bg-transparent text-gray-600 shadow-none',
          'hover:bg-gray-100 hover:text-gray-900',
          'active:bg-gray-200',
          'focus-visible:ring-gray-500',
        ],
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant,
      size,
      fullWidth,
      isLoading = false,
      disabled = false,
      icon,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        {...props}
      >
        {isLoading && <Spinner size="sm" />}
        {!isLoading && icon}
        <span className={isLoading ? 'ml-1' : ''}>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
```

### Card with Variant System

```typescript
// frontend/src/components/ui/Card/Card.tsx
import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'bg-white rounded-xl overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border border-gray-200 shadow-sm',
        elevated: 'shadow-lg',
        outlined: 'border-2 border-gray-200',
      },
      hoverable: {
        true: 'transition-all duration-200 cursor-pointer hover:shadow-md',
        false: '',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      hoverable: false,
      padding: 'none',
    },
  }
);

export interface CardProps extends VariantProps<typeof cardVariants> {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card = ({
  children,
  variant,
  hoverable,
  padding,
  title,
  subtitle,
  actions,
  className,
  onClick,
}: CardProps) => {
  const hasHeader = title || subtitle || actions;

  return (
    <div
      className={cn(cardVariants({ variant, hoverable, padding }), className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {hasHeader && (
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex-shrink-0">{actions}</div>}
          </div>
        </div>
      )}
      <div className={hasHeader ? 'px-6 pb-6' : ''}>{children}</div>
    </div>
  );
};
```

### Checkbox Component

```typescript
// frontend/src/components/ui/Checkbox/Checkbox.tsx
import { forwardRef, type InputHTMLAttributes, useId } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  error?: string;
  indeterminate?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: { box: 'w-4 h-4', icon: 'w-3 h-3', text: 'text-sm' },
  md: { box: 'w-5 h-5', icon: 'w-3.5 h-3.5', text: 'text-base' },
  lg: { box: 'w-6 h-6', icon: 'w-4 h-4', text: 'text-lg' },
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      error,
      indeterminate = false,
      size = 'md',
      className,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;
    const descriptionId = `${checkboxId}-description`;
    const errorId = `${checkboxId}-error`;
    const sizes = sizeClasses[size];

    return (
      <div className={cn('relative', className)}>
        <label
          htmlFor={checkboxId}
          className={cn(
            'flex items-start gap-3 cursor-pointer',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <div className="relative flex-shrink-0">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              disabled={disabled}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={
                error ? errorId : description ? descriptionId : undefined
              }
              className="peer sr-only"
              {...props}
            />
            <div
              className={cn(
                sizes.box,
                'rounded border-2 transition-all duration-150',
                'border-gray-300 bg-white',
                'peer-checked:border-primary-600 peer-checked:bg-primary-600',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-1',
                error && 'border-error-500',
                'flex items-center justify-center'
              )}
            >
              <Check
                className={cn(
                  sizes.icon,
                  'text-white opacity-0 transition-opacity',
                  'peer-checked:opacity-100'
                )}
              />
              {indeterminate && (
                <Minus
                  className={cn(sizes.icon, 'text-white absolute')}
                />
              )}
            </div>
          </div>
          {(label || description) && (
            <div className="flex flex-col">
              {label && (
                <span className={cn(sizes.text, 'font-medium text-gray-900')}>
                  {label}
                </span>
              )}
              {description && (
                <span
                  id={descriptionId}
                  className="text-sm text-gray-500 mt-0.5"
                >
                  {description}
                </span>
              )}
            </div>
          )}
        </label>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-error-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
```

### Skeleton Loading Components

```typescript
// frontend/src/components/ui/Loading/Skeleton.tsx
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => (
  <div
    className={cn('animate-pulse bg-gray-200 rounded', className)}
    aria-hidden="true"
  />
);

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export const SkeletonText = ({ lines = 3, className }: SkeletonTextProps) => (
  <div className={cn('space-y-2', className)} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={cn('h-4', i === lines - 1 && 'w-3/4')}
      />
    ))}
  </div>
);

export const SkeletonCircle = ({ className }: SkeletonProps) => (
  <Skeleton className={cn('rounded-full', className)} />
);

export const SkeletonCard = ({ className }: SkeletonProps) => (
  <div
    className={cn('bg-white rounded-xl border border-gray-200 p-6', className)}
    aria-hidden="true"
  >
    <div className="flex items-center gap-4 mb-4">
      <SkeletonCircle className="w-12 h-12" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    <SkeletonText lines={3} />
  </div>
);
```

### Progress Bar Component

```typescript
// frontend/src/components/ui/Loading/Progress.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const progressVariants = cva('h-full rounded-full transition-all duration-300', {
  variants: {
    variant: {
      default: 'bg-primary-600',
      success: 'bg-success-500',
      warning: 'bg-warning-500',
      error: 'bg-error-500',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface ProgressProps extends VariantProps<typeof progressVariants> {
  value: number; // 0-100
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export const Progress = ({
  value,
  max = 100,
  variant,
  showLabel = false,
  size = 'md',
  className,
}: ProgressProps) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn('w-full bg-gray-200 rounded-full overflow-hidden', sizeClasses[size])}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={progressVariants({ variant })}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="mt-1 text-sm text-gray-600">
          {percentage.toFixed(0)}%
        </span>
      )}
    </div>
  );
};
```

### Storybook Configuration

```typescript
// .storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
};

export default config;
```

```typescript
// .storybook/preview.ts
import type { Preview } from '@storybook/react';
import '../src/styles/index.css'; // Import Tailwind styles

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // WCAG 2.2 AA compliance
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'label', enabled: true },
        ],
      },
    },
  },
};

export default preview;
```

### Example Story File

```typescript
// frontend/src/components/ui/Button/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Plus, Save } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClick: fn(),
    children: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// All 5 states for primary variant
export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Delete',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost Button',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: 'Disabled',
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    children: 'Saving...',
  },
};

export const WithIcon: Story = {
  args: {
    icon: <Plus className="w-4 h-4" />,
    children: 'Add Item',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="primary" disabled>Primary</Button>
        <Button variant="secondary" disabled>Secondary</Button>
        <Button variant="danger" disabled>Danger</Button>
        <Button variant="ghost" disabled>Ghost</Button>
      </div>
    </div>
  ),
};
```

## State of the Art

| Old Approach (2023-2024) | Current Approach (2026) | When Changed | Impact |
|--------------------------|-------------------------|--------------|--------|
| **Manual variant props with switch statements** | CVA for type-safe variants | 2024 | Type inference, single source of truth |
| **:focus for all focus states** | :focus-visible for keyboard-only | 2023 | Cleaner UX for mouse users, accessible for keyboard |
| **Custom checkbox with divs** | Native input with peer styling | 2024 | Free keyboard support, form integration |
| **Separate loading spinner component** | Integrated loading state in buttons | 2024 | Better UX, consistent appearance |
| **CSS-in-JS for component styles** | Tailwind + CVA | 2024-2025 | Better performance, smaller bundle, co-location |

**Deprecated/outdated:**
- **classnames package**: Use `clsx` instead (smaller, faster)
- **styled-components for design systems**: Use Tailwind + CVA for better performance
- **Manual ARIA for simple inputs**: Use native elements with proper styling

## Open Questions

1. **Badge Component Consolidation**
   - What we know: StatusBadge and PriorityBadge exist with different patterns
   - What's unclear: Should they be merged into one Badge component with type variant, or stay separate?
   - Recommendation: Keep separate but standardize patterns (both use CVA). StatusBadge serves specific domain purpose.

2. **Icon Component Necessity**
   - What we know: lucide-react already provides typed icons with consistent sizing
   - What's unclear: Is an Icon wrapper component needed?
   - Recommendation: Create thin wrapper only if we need consistent default sizing or color. Otherwise, use lucide-react directly.

3. **Existing Component Migration Timing**
   - What we know: Button, Input, Card, Select exist and work
   - What's unclear: Migrate in-place or create new versions?
   - Recommendation: Migrate in-place to avoid dual system (Pitfall 1 from roadmap). Update imports, keep API compatible.

## Sources

### Primary (HIGH confidence)

**CVA:**
- [class-variance-authority Official Docs](https://cva.style/docs) - Installation, variants, compound variants
- [CVA Variants Guide](https://cva.style/docs/getting-started/variants) - Complete variant API

**Storybook:**
- [Storybook for React & Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite) - Official setup guide
- [Tailwind CSS Storybook Recipe](https://storybook.js.org/recipes/tailwindcss) - Official Tailwind integration

**Accessibility:**
- [React Aria useCheckbox](https://react-spectrum.adobe.com/react-aria/useCheckbox.html) - Checkbox accessibility patterns
- [MDN ARIA checkbox role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/checkbox_role) - ARIA requirements
- [Focus Indicator Design Guide](https://www.sarasoueidan.com/blog/focus-indicators/) - WCAG compliant focus states

**Tailwind Patterns:**
- [Tailwind Animation Docs](https://tailwindcss.com/docs/animation) - animate-pulse for skeletons

### Secondary (MEDIUM confidence)

**Component Patterns:**
- [Building a Button Part 3: Keyboard Focus](https://react-spectrum.adobe.com/blog/building-a-button-part-3.html) - Focus behavior patterns
- [Atomic Design Pattern React Structure](https://dev.to/mroman7/atomic-design-pattern-how-to-set-up-your-reactjs-project-structure-44pm) - Folder organization

**Design System Comparisons:**
- [Radix UI Introduction](https://www.radix-ui.com/primitives/docs/overview/introduction) - When to use primitives library
- [CVA vs Tailwind Variants](https://dev.to/webdevlapani/cva-vs-tailwind-variants-choosing-the-right-tool-for-your-design-system-12am) - Tool comparison

### Tertiary (LOW confidence - needs validation)

- Storybook addon ecosystem may have newer options (check latest when implementing)

## Metadata

**Confidence breakdown:**
- CVA patterns: HIGH - Official docs, widely adopted (shadcn/ui)
- Storybook setup: HIGH - Official framework, documented integration
- Component patterns: HIGH - Based on existing codebase analysis + best practices
- Accessibility: HIGH - Official React Aria docs, MDN, WCAG standards
- Folder structure: MEDIUM - Multiple valid approaches exist

**Research date:** 2026-01-21
**Valid until:** 60 days (stable libraries, patterns)

**CogVeri-specific findings:**
- Existing components are ~80% complete, need enhancement not replacement
- cn() utility already exists and works well
- lucide-react already installed, no new icon library needed
- ESLint Tailwind rules from Phase 1 will catch anti-patterns
- No Storybook currently - full setup required
- CheckBox component missing entirely - needs creation
- Avatar component missing - needs creation
- Progress bar exists inline in UsageDisplay.tsx - needs extraction
- Skeleton components don't exist - needs creation

**Phase 2 Readiness:** HIGH
- Clear migration path for existing components
- CVA provides type-safe variant system
- Storybook setup is straightforward with Vite
- All primitives can be built with native elements (no Radix dependency yet)
