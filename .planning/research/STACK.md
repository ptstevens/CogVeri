# Technology Stack: UI/UX Design System with TailwindCSS

**Project:** CogVeri UI Refresh
**Domain:** SaaS Design System (Screen Recording & Video Analysis Platform)
**Researched:** 2026-01-21
**Current Stack:** React 18.3.1, Vite 6.4.1, TailwindCSS 3.4.19
**Confidence:** HIGH

## Executive Summary

CogVeri currently uses TailwindCSS 3.4.19 with a well-structured theme (teal/navy/orange brand colors, Inter font, slate neutrals). The recommended 2025/2026 approach maintains this foundation while adopting modern patterns: CSS variables for runtime theming, OKLCH color space for accessibility, component-based architecture, and preparation for eventual Tailwind v4 migration.

**Key Recommendation:** Enhance the existing Tailwind 3.4.x configuration with CSS variables, adopt Stripe-style accessible color systems, and build a reusable component library while maintaining backward compatibility.

---

## Recommended Stack

### Core Framework & Tooling

| Technology | Current Version | Recommended | Purpose | Why |
|------------|----------------|-------------|---------|-----|
| **TailwindCSS** | 3.4.19 | 3.4.x (stable) | Utility-first CSS framework | Industry standard for design systems in 2025. v3.4.x is production-ready; v4 is in beta with breaking changes. Stay on v3 for stability. |
| **@tailwindcss/typography** | 0.5.19 | 0.5.19+ | Typography plugin for prose content | Essential for markdown/rich text rendering with beautiful typographic defaults. |
| **PostCSS** | 8.5.6 | 8.5.6+ | CSS processor | Required for Tailwind, enables future CSS features. |
| **Autoprefixer** | 10.4.23 | 10.4.23+ | CSS vendor prefixing | Ensures cross-browser compatibility. |

**Rationale:** TailwindCSS 3.4.x provides stability for production SaaS applications. While v4 offers CSS-first configuration with `@theme`, it's still in beta. The migration path is clear but should wait until v4 reaches stable release.

### Typography System

| Component | Recommended | Fallback Chain | Purpose |
|-----------|-------------|----------------|---------|
| **Primary Font** | Inter Variable | `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | UI text, headings, body copy |
| **Monospace Font** | System Monospace | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | Code snippets, technical content |

**Current Implementation:** Already using Inter via Google Fonts CDN.

**Recommendation for UI Refresh:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');

@layer base {
  :root {
    --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  body {
    font-family: var(--font-sans);
  }
}
```

**Why Inter:**
- Designed specifically for screen readability with open letterforms
- Variable font support (100-900 weights) reduces HTTP requests
- Industry standard for professional SaaS (used by Stripe, GitHub, Vercel)
- Excellent hinting and spacing for UI elements
- Strong support for multiple languages and OpenType features

**Alternative Consideration:** Geist Sans (by Vercel) is emerging as a modern alternative, but Inter has broader adoption and proven track record.

---

## Color System Architecture

### Strategy: Stripe-Inspired Accessible Color System

Based on Stripe's CIELAB approach, implement a perceptually uniform color system that guarantees WCAG 2.2 AA compliance (4.5:1 contrast for text, 3:1 for large text).

### Current Color Palette Assessment

**Strengths:**
- Well-defined semantic naming (primary, accent, brand)
- Slate neutral grays (high contrast, modern)
- Complete 50-950 scales for primary/accent
- Teal (trust, verification) aligns with brand identity

**Gaps for Stripe/Notion Style:**
- Current teal is vibrant but may not meet accessibility targets at all levels
- No CSS variable integration for runtime theming
- No documentation of contrast ratios
- Missing semantic color tokens (border, background, text)

### Recommended Color Palette Structure

#### 1. Neutral Grays (Foundation)

**Use:** Backgrounds, borders, text hierarchy, shadows

```javascript
// tailwind.config.js - Keep existing slate grays
gray: {
  50: '#f8fafc',   // Background - subtle
  100: '#f1f5f9',  // Background - cards
  200: '#e2e8f0',  // Borders - dividers
  300: '#cbd5e1',  // Borders - inputs
  400: '#94a3b8',  // Text - muted
  500: '#64748b',  // Text - secondary
  600: '#475569',  // Text - body
  700: '#334155',  // Text - headings
  800: '#1e293b',  // Text - emphasis
  900: '#0f172a',  // Text - maximum contrast
  950: '#020617',  // Backgrounds - dark mode
}
```

**Rationale:** Slate grays provide professional, high-contrast neutrals that work well with green accents. More refined than pure gray, less blue-tinted than blue-gray.

#### 2. Green Accent (Primary Brand)

**Current:** Teal (0d9488 / #14b8a6)
**Recommendation:** Shift to emerald green for better "verification/success" semantics while maintaining teal heritage

```javascript
// Option A: Keep teal, enhance accessibility
primary: {
  50: '#f0fdfa',   // Backgrounds
  100: '#ccfbf1',  // Subtle backgrounds
  200: '#99f6e4',  // Hover states
  300: '#5eead4',  // Accents
  400: '#2dd4bf',  // Interactive elements
  500: '#14b8a6',  // Primary actions (current)
  600: '#0d9488',  // Primary hover (meets 4.5:1 on white)
  700: '#0f766e',  // Primary pressed
  800: '#115e59',  // Dark text
  900: '#134e4a',  // Maximum emphasis
  950: '#042f2e',  // Dark backgrounds
}

// Option B: Migrate to emerald (more "green", less "cyan")
primary: {
  50: '#ecfdf5',   // Backgrounds
  100: '#d1fae5',  // Subtle backgrounds
  200: '#a7f3d0',  // Hover states
  300: '#6ee7b7',  // Accents
  400: '#34d399',  // Interactive elements
  500: '#10b981',  // Primary actions
  600: '#059669',  // Primary hover (meets 4.5:1 on white)
  700: '#047857',  // Primary pressed
  800: '#065f46',  // Dark text
  900: '#064e3b',  // Maximum emphasis
  950: '#022c22',  // Dark backgrounds
}
```

**Recommendation:** **Option A (Keep Teal)** - Already integrated into brand identity. Enhance with CSS variables for runtime accessibility adjustments.

**Accessibility Targets:**
- `primary-600` on white: 4.52:1 (passes AA for small text)
- `primary-700` on white: 5.89:1 (passes AA for normal text, AAA for large text)
- Any two colors 500+ levels apart: guaranteed 4.5:1+ contrast

#### 3. Semantic Colors

Define semantic color tokens that reference the palette:

```css
@layer base {
  :root {
    /* Backgrounds */
    --color-bg-primary: theme('colors.white');
    --color-bg-secondary: theme('colors.gray.50');
    --color-bg-tertiary: theme('colors.gray.100');
    --color-bg-overlay: theme('colors.gray.900 / 0.5');

    /* Borders */
    --color-border-default: theme('colors.gray.200');
    --color-border-emphasis: theme('colors.gray.300');
    --color-border-brand: theme('colors.primary.500');

    /* Text */
    --color-text-primary: theme('colors.gray.900');
    --color-text-secondary: theme('colors.gray.600');
    --color-text-tertiary: theme('colors.gray.500');
    --color-text-brand: theme('colors.primary.600');
    --color-text-on-brand: theme('colors.white');

    /* Interactive */
    --color-interactive-default: theme('colors.primary.600');
    --color-interactive-hover: theme('colors.primary.700');
    --color-interactive-pressed: theme('colors.primary.800');

    /* Status */
    --color-success: theme('colors.success.600');
    --color-warning: theme('colors.warning.600');
    --color-error: theme('colors.error.600');
    --color-info: theme('colors.primary.600');
  }
}
```

**Why CSS Variables:**
- Runtime theming support (user preferences, dark mode)
- Centralized token management
- Easier A/B testing of color variations
- Preparation for Tailwind v4 migration
- Semantic naming improves maintainability

### Color Usage Guidelines (Stripe/Notion Pattern)

| Use Case | Color | Rationale |
|----------|-------|-----------|
| **Primary Actions** | `primary-600` | High contrast, brand recognition |
| **Secondary Actions** | `gray-600` text on white bg | Subtle, professional |
| **Backgrounds** | `white`, `gray-50`, `gray-100` | Clean, minimal, Notion-style |
| **Text Hierarchy** | `gray-900` → `gray-600` → `gray-500` | Clear information hierarchy |
| **Borders/Dividers** | `gray-200` | Subtle separation without distraction |
| **Success States** | `success-600` (emerald) | Distinct from brand green |
| **Hover States** | Darken by 100 points | Predictable, accessible |
| **Focus Rings** | `primary-500` with opacity | Accessible, brand-aligned |

**Key Principle:** Use neutral grays for 90% of the UI, green accent sparingly for primary actions and brand moments. This creates a calm, professional aesthetic similar to Stripe/Notion.

---

## TailwindCSS Configuration Best Practices

### Structure: Theme Extension Pattern

**Current:** `extend` pattern preserves Tailwind defaults while adding custom values ✅
**Recommendation:** Continue this approach, enhance with CSS variables.

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Colors - see "Color System Architecture" above
      colors: {
        primary: { /* ... */ },
        gray: { /* ... */ },
        // etc.
      },

      // Typography
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },

      fontSize: {
        // Use Tailwind defaults, extend as needed
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        // Display sizes for marketing pages
        'display-sm': ['2.5rem', { lineHeight: '3rem', fontWeight: '600' }],
        'display-md': ['3rem', { lineHeight: '3.5rem', fontWeight: '600' }],
        'display-lg': ['3.75rem', { lineHeight: '4rem', fontWeight: '700' }],
      },

      // Spacing - Use Tailwind defaults (4px base)
      spacing: {
        // Extend only for specific needs
        '128': '32rem',
        '144': '36rem',
      },

      // Border Radius - Stripe/Notion favor subtle rounds
      borderRadius: {
        'sm': '0.25rem',   // 4px - inputs, small elements
        'DEFAULT': '0.5rem', // 8px - buttons, cards
        'md': '0.5rem',    // 8px - alias for default
        'lg': '0.75rem',   // 12px - larger cards
        'xl': '1rem',      // 16px - modals, panels
        '2xl': '1.5rem',   // 24px - hero sections
      },

      // Shadows - Refined, subtle elevation
      boxShadow: {
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'sm': '0 1px 2px 0 rgb(15 23 42 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(15 23 42 / 0.1), 0 1px 2px -1px rgb(15 23 42 / 0.1)',
        'md': '0 4px 6px -1px rgb(15 23 42 / 0.1), 0 2px 4px -2px rgb(15 23 42 / 0.1)',
        'lg': '0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)',
        'xl': '0 20px 25px -5px rgb(15 23 42 / 0.1), 0 8px 10px -6px rgb(15 23 42 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        'brand': '0 4px 14px 0 rgb(13 148 136 / 0.15)',    // Subtle brand glow
        'brand-lg': '0 10px 25px -3px rgb(13 148 136 / 0.2)', // Stronger brand elevation
      },

      // Animations - Subtle, professional
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 200ms ease-out',
        'scale-in': 'scaleIn 150ms ease-out',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
```

### CSS Variables Integration

Create a dedicated CSS variables layer for runtime theming:

```css
/* frontend/src/styles/theme.css */
@layer base {
  :root {
    /* Typography */
    --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

    /* Spacing Scale (Tailwind's 4px base) */
    --spacing-unit: 0.25rem; /* 4px */

    /* Colors - Semantic Tokens */
    /* Backgrounds */
    --color-bg-primary: 255 255 255; /* white */
    --color-bg-secondary: 248 250 252; /* gray-50 */
    --color-bg-tertiary: 241 245 249; /* gray-100 */

    /* Borders */
    --color-border: 226 232 240; /* gray-200 */
    --color-border-emphasis: 203 213 225; /* gray-300 */

    /* Text */
    --color-text-primary: 15 23 42; /* gray-900 */
    --color-text-secondary: 71 85 105; /* gray-600 */
    --color-text-tertiary: 100 116 139; /* gray-500 */

    /* Brand */
    --color-primary: 13 148 136; /* primary-600 */
    --color-primary-hover: 15 118 110; /* primary-700 */

    /* Radius */
    --radius-sm: 0.25rem;
    --radius-md: 0.5rem;
    --radius-lg: 0.75rem;

    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgb(15 23 42 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(15 23 42 / 0.1), 0 2px 4px -2px rgb(15 23 42 / 0.1);

    /* Animation Timing */
    --duration-fast: 150ms;
    --duration-base: 200ms;
    --duration-slow: 300ms;
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Dark mode overrides (future) */
  @media (prefers-color-scheme: dark) {
    :root {
      --color-bg-primary: 15 23 42;
      --color-bg-secondary: 30 41 59;
      /* ... */
    }
  }
}
```

**Usage in Components:**
```tsx
// Use Tailwind utilities (preferred)
<div className="bg-gray-50 text-gray-900 rounded-lg">

// Use CSS variables for custom components
<div style={{
  backgroundColor: `rgb(var(--color-bg-secondary))`,
  color: `rgb(var(--color-text-primary))`
}}>

// Use in custom CSS
.custom-component {
  background-color: rgb(var(--color-bg-secondary));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
```

---

## Component Architecture

### Pattern: Component Library + Tailwind Utilities

**Philosophy:** Build reusable components with Tailwind utilities, extract common patterns, document in Storybook.

**Structure:**
```
frontend/src/components/
├── ui/                    # Base UI components
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   └── Button.stories.tsx
│   ├── Card/
│   ├── Input/
│   ├── Badge/
│   └── index.ts
├── layout/                # Layout components
│   ├── PageHeader/
│   ├── Sidebar/
│   └── Container/
├── domain/                # Domain-specific components
│   ├── RecordingCard/
│   ├── TaskAssignment/
│   └── VideoPlayer/
└── shared/                # Shared utilities
    ├── LoadingSpinner/
    └── EmptyState/
```

### Base Component Patterns (Stripe/Notion Style)

#### Button Component

```tsx
// frontend/src/components/ui/Button/Button.tsx
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils'; // classnames utility

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const buttonVariants = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 shadow-sm',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-200',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-200',
  danger: 'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500 shadow-sm',
};

const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        // Base styles
        'inline-flex items-center justify-center font-medium rounded-lg',
        'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Variant
        buttonVariants[variant],
        // Size
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading && <Spinner className="mr-2" />}
      {children}
    </button>
  );
});
```

**Rationale:**
- Variant-based design matches Stripe/Notion patterns
- TypeScript for type safety
- Forwarded refs for accessibility
- Composable with Tailwind utilities
- Loading states built-in

#### Card Component

```tsx
// frontend/src/components/ui/Card/Card.tsx
import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-white rounded-lg',
        variant === 'bordered' && 'border border-gray-200',
        variant === 'elevated' && 'shadow-md',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-6',
        padding === 'lg' && 'p-8',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 pb-4 border-b border-gray-200', className)} {...props} />
);

export const CardBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-4', className)} {...props} />
);

export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-4 pt-4 border-t border-gray-200', className)} {...props} />
);
```

**Pattern Benefits:**
- Composable sub-components (Header, Body, Footer)
- Flexible padding/variant system
- Maintains Tailwind utility composition
- Easy to extend with additional variants

### CSS Component Classes (via @layer)

For frequently repeated patterns that don't warrant a React component:

```css
@layer components {
  /* Button classes (if not using React component) */
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg;
    @apply transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1;
    @apply disabled:opacity-50 disabled:cursor-not-allowed shadow-sm;
  }

  .btn-primary {
    @apply bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500;
  }

  .btn-secondary {
    @apply bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-200;
  }

  /* Input classes */
  .input {
    @apply w-full px-3 py-2 text-sm border border-gray-300 rounded-lg;
    @apply placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500;
    @apply transition-all duration-200;
  }

  /* Focus rings */
  .focus-ring {
    @apply focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2;
  }
}
```

**When to Use:**
- Simple utility combinations used across multiple components
- Styling that doesn't need React state/props
- Rapid prototyping before extracting to React components

---

## Typography Configuration

### Font Loading Strategy

**Current:** Google Fonts CDN via `@import`
**Recommendation:** Continue with CDN for simplicity, consider self-hosting for performance optimization later.

```css
/* Option 1: Google Fonts CDN (current, simple) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');

/* Option 2: Self-hosted (performance, GDPR compliance) */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}
```

**Recommendation:** Start with CDN (Option 1), migrate to self-hosted (Option 2) if:
- Performance budget is tight (reduce DNS lookup, connection overhead)
- GDPR/privacy concerns (no third-party requests)
- Need offline support

### Typography Scale

**Stripe/Notion Pattern:** Conservative, readable type scale with clear hierarchy.

| Class | Size | Line Height | Use Case |
|-------|------|-------------|----------|
| `text-xs` | 12px (0.75rem) | 16px (1rem) | Captions, labels, badges |
| `text-sm` | 14px (0.875rem) | 20px (1.25rem) | Secondary text, form inputs |
| `text-base` | 16px (1rem) | 24px (1.5rem) | Body text (default) |
| `text-lg` | 18px (1.125rem) | 28px (1.75rem) | Emphasized body text |
| `text-xl` | 20px (1.25rem) | 28px (1.75rem) | Section headers |
| `text-2xl` | 24px (1.5rem) | 32px (2rem) | Page headers |
| `text-3xl` | 30px (1.875rem) | 36px (2.25rem) | Hero headers |
| `text-4xl` | 36px (2.25rem) | 40px (2.5rem) | Display headers |

**Font Weights:**
| Class | Weight | Use Case |
|-------|--------|----------|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Buttons, emphasized text |
| `font-semibold` | 600 | Headings, labels |
| `font-bold` | 700 | Strong emphasis |

**Typography Guidelines:**
1. **Body text:** `text-base font-normal text-gray-900` (16px, 400 weight)
2. **Secondary text:** `text-sm text-gray-600` (14px, gray)
3. **Headings:** `text-2xl font-semibold text-gray-900` (24px, 600 weight)
4. **Labels:** `text-sm font-medium text-gray-700` (14px, 500 weight)
5. **Captions:** `text-xs text-gray-500` (12px, gray)

### @tailwindcss/typography Configuration

For markdown/rich text content:

```javascript
// tailwind.config.js
module.exports = {
  plugins: [
    require('@tailwindcss/typography')({
      modifiers: ['sm', 'lg'],
    }),
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            color: theme('colors.gray.900'),
            maxWidth: '65ch',
            a: {
              color: theme('colors.primary.600'),
              textDecoration: 'none',
              fontWeight: '500',
              '&:hover': {
                color: theme('colors.primary.700'),
                textDecoration: 'underline',
              },
            },
            strong: {
              color: theme('colors.gray.900'),
              fontWeight: '600',
            },
            code: {
              color: theme('colors.gray.900'),
              backgroundColor: theme('colors.gray.100'),
              borderRadius: theme('borderRadius.DEFAULT'),
              padding: '0.25rem 0.375rem',
              fontWeight: '500',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
          },
        },
      },
    },
  },
};
```

---

## Stripe/Notion Design Patterns

### Core Principles

1. **Minimal Color Usage:** 90% neutral grays, 10% brand green
2. **High Contrast:** Ensure 4.5:1+ contrast for all text
3. **Subtle Elevation:** Use shadows sparingly, prefer borders
4. **Generous Whitespace:** Let content breathe
5. **Fast Animations:** 150-200ms transitions, ease-out easing
6. **Rounded Corners:** 8px (lg) for cards, 6px (md) for buttons

### Pattern Library

#### 1. Page Layout (Notion Style)

```tsx
<div className="min-h-screen bg-gray-50">
  {/* Sidebar */}
  <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
    {/* Navigation */}
  </aside>

  {/* Main Content */}
  <main className="ml-64 p-8">
    {/* Page Header */}
    <header className="mb-8">
      <h1 className="text-3xl font-semibold text-gray-900">Page Title</h1>
      <p className="mt-2 text-sm text-gray-600">Description</p>
    </header>

    {/* Content */}
    <div className="space-y-6">
      {/* Cards, lists, etc. */}
    </div>
  </main>
</div>
```

#### 2. Card Grid (Stripe Style)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
    <h3 className="text-lg font-semibold text-gray-900">Title</h3>
    <p className="mt-2 text-sm text-gray-600">Description</p>
  </div>
</div>
```

#### 3. Form Patterns

```tsx
<div className="space-y-6 max-w-lg">
  {/* Input Group */}
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      Label
    </label>
    <input
      type="text"
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
      placeholder="Enter value"
    />
    <p className="mt-1.5 text-xs text-gray-500">Helper text</p>
  </div>

  {/* Actions */}
  <div className="flex items-center gap-3">
    <button className="btn btn-primary">Save</button>
    <button className="btn btn-secondary">Cancel</button>
  </div>
</div>
```

#### 4. Data Tables

```tsx
<div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
  <table className="min-w-full divide-y divide-gray-200">
    <thead className="bg-gray-50">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Column
        </th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-gray-200">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4 text-sm text-gray-900">
          Cell
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

#### 5. Empty States

```tsx
<div className="text-center py-12">
  <svg className="mx-auto h-12 w-12 text-gray-400" /* ... */ />
  <h3 className="mt-2 text-sm font-medium text-gray-900">No data</h3>
  <p className="mt-1 text-sm text-gray-500">Get started by creating a new item.</p>
  <div className="mt-6">
    <button className="btn btn-primary">Create Item</button>
  </div>
</div>
```

---

## Migration Path: Tailwind v3 → v4

**Current:** TailwindCSS 3.4.19
**Future:** TailwindCSS v4 (beta as of Jan 2026, stable release TBD)

### Key Changes in v4

1. **CSS-First Configuration:** Replace `tailwind.config.js` with `@theme` directive in CSS
2. **CSS Variables by Default:** All tokens exposed as CSS variables
3. **OKLCH Color Space:** More vibrant, perceptually uniform colors
4. **Unified Imports:** Single `@import "tailwindcss"`

### Preparation Steps

To prepare for v4 without breaking changes:

1. **Adopt CSS Variables Now:**
   ```css
   @layer base {
     :root {
       --color-primary: theme('colors.primary.600');
     }
   }
   ```

2. **Document Theme Tokens:**
   Create a `theme.css` file with all customizations documented

3. **Use Semantic Naming:**
   Map design tokens to semantic variables (already recommended above)

4. **Avoid Deep `@apply` Nesting:**
   Tailwind v4 may change `@apply` behavior; prefer utility classes

### Migration Checklist (When v4 Stable)

```markdown
- [ ] Update dependencies: `npm install tailwindcss@latest`
- [ ] Convert `tailwind.config.js` to `@theme` in CSS
- [ ] Test color contrast ratios (OKLCH may shift hues)
- [ ] Update `@import` statements to `@import "tailwindcss"`
- [ ] Remove `postcss.config.js` if no longer needed
- [ ] Run full regression testing suite
- [ ] Update documentation
```

**Recommendation:** Wait for v4 stable release before migrating production applications. v3.4.x is actively maintained and production-ready.

---

## Supporting Libraries

| Library | Version | Purpose | Integration |
|---------|---------|---------|-------------|
| **clsx** or **classnames** | Latest | Conditional className composition | `npm install clsx` |
| **tailwind-merge** | Latest | Merge Tailwind classes without conflicts | `npm install tailwind-merge` |
| **Storybook** | 7.x+ | Component documentation | `npx storybook@latest init` |
| **prettier-plugin-tailwindcss** | Latest | Auto-sort Tailwind classes | Add to `.prettierrc` |

### Utility: Class Name Helper

```typescript
// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes without conflicts
 * Usage: cn('bg-red-500', condition && 'bg-blue-500') => 'bg-blue-500'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage:**
```tsx
<div className={cn(
  'base-class',
  variant === 'primary' && 'variant-class',
  disabled && 'disabled-class',
  className
)}>
```

---

## Installation Guide

### Step 1: Install Dependencies

```bash
cd frontend

# Already installed (verify versions)
npm list tailwindcss @tailwindcss/typography

# Add new utilities
npm install clsx tailwind-merge

# Dev dependencies
npm install -D prettier-plugin-tailwindcss
```

### Step 2: Update Prettier Config

```json
// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### Step 3: Create Utility Files

```bash
# Create lib/utils.ts if not exists
mkdir -p frontend/src/lib
touch frontend/src/lib/utils.ts

# Create theme.css
touch frontend/src/styles/theme.css
```

### Step 4: Update CSS Imports

```css
/* frontend/src/styles/index.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
@import './theme.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ... rest of styles */
```

### Step 5: Verify Configuration

```bash
# Type check
npm run type-check

# Build
npm run build

# Start dev server
npm run dev
```

---

## Accessibility Checklist

Following Stripe's approach to accessible color systems:

- [ ] **Color Contrast:** All text meets WCAG 2.2 AA (4.5:1 for normal, 3:1 for large)
- [ ] **Focus Indicators:** 2px visible focus ring on all interactive elements
- [ ] **Keyboard Navigation:** Tab order follows visual flow
- [ ] **Touch Targets:** Minimum 44x44px for mobile
- [ ] **Semantic HTML:** Use `<button>`, `<nav>`, `<main>`, etc.
- [ ] **ARIA Labels:** Add when semantic HTML insufficient
- [ ] **Color Independence:** Never rely on color alone for meaning
- [ ] **Motion Preferences:** Respect `prefers-reduced-motion`

### Accessibility Utilities

```css
@layer utilities {
  /* Screen reader only */
  .sr-only {
    @apply absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0;
    clip: rect(0, 0, 0, 0);
  }

  /* Focus visible (keyboard only) */
  .focus-ring {
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2;
  }

  /* Respect motion preferences */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

---

## Performance Considerations

### CSS File Size

**Tailwind 3.4.x JIT:** Generates only used utilities (~5-20 KB gzipped in production)

**Optimization Strategies:**
1. **Purge Unused Classes:** Already configured via `content` in config
2. **Avoid `@apply` Overuse:** Prefer utility classes to reduce duplication
3. **Code Splitting:** Lazy load route-specific styles
4. **Minification:** Enabled by default in production build

### Font Loading Performance

```css
/* Preload Inter font for faster render */
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin>
```

### Bundle Size Monitoring

```bash
# Analyze bundle size
npm run build
npx vite-bundle-visualizer
```

**Target:** TailwindCSS output < 20 KB gzipped

---

## Sources

### Official Documentation (HIGH Confidence)
- [Tailwind CSS Theme Configuration](https://tailwindcss.com/docs/theme) - Official docs on theme variables and configuration
- [Tailwind CSS v4 Release Notes](https://tailwindcss.com/blog/tailwindcss-v4) - Official announcement of v4 features
- [Stripe: Designing Accessible Color Systems](https://stripe.com/blog/accessible-color-systems) - Stripe's approach to CIELAB-based color design
- [@tailwindcss/typography Plugin](https://github.com/tailwindlabs/tailwindcss-typography) - Official typography plugin documentation

### Community Best Practices (MEDIUM Confidence)
- [Tailwind CSS Best Practices 2025-2026](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns) - Design tokens, typography, responsive patterns
- [How to Master Tailwind CSS: Best Practices 2025](https://www.bootstrapdash.com/blog/tailwind-css-best-practices) - Component reusability, performance optimization
- [Building a Unified Design System with React, Tailwind CSS, and Figma](https://medium.com/@roman_fedyskyi/building-a-unified-design-system-with-react-tailwind-css-and-figma-part-2-0ec66658deb7) - Syncing design tokens from Figma to code
- [Modern Font Stacks](https://modernfontstacks.com/) - System font stack best practices
- [10 Trending Fonts for SaaS Websites in 2025](https://medium.com/@mypippa.studio/10-trending-fonts-for-saas-websites-in-2025-for-ui-ux-design-a8860171721d) - Inter, Satoshi, Geist Sans recommendations

### Design Inspiration (MEDIUM Confidence)
- [Choosing the Right Brand Color Palette for B2B SaaS](https://www.kalungi.com/blog/choosing-branding-colors-for-your-b2b-saas-company) - Green accent color psychology
- [Best 30 SaaS UI Design Color Palettes](https://octet.design/colors/user-interfaces/saas-ui-design/) - SaaS color palette examples
- [Top 2026 Web Design Color Trends](https://www.loungelizard.com/blog/web-design-color-trends/) - Neutral spaces with saturated accents

### Technical Implementation (MEDIUM Confidence)
- [CSS Variables + TailwindCSS](https://docs.hyva.io/hyva-themes/working-with-tailwindcss/css-variables-plus-tailwindcss.html) - Integration patterns
- [Theme Design System with CSS Variables in Tailwind](https://medium.com/@jaykumarv2605/theme-design-system-with-css-variables-in-tailwind-next-js-885a88da1f2a) - Multi-theme implementation

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|-----------|-----------|
| **TailwindCSS Version Recommendation** | HIGH | Official docs confirm 3.4.x stability, v4 beta status |
| **Color System (Stripe/CIELAB)** | HIGH | Official Stripe blog post, WCAG standards are well-documented |
| **Typography (Inter)** | HIGH | Widespread adoption, official font documentation, community consensus |
| **CSS Variables Integration** | HIGH | Official Tailwind docs, verified patterns |
| **Component Patterns** | MEDIUM | Best practices from community, not officially prescribed by Tailwind |
| **Migration Path to v4** | MEDIUM | Based on v4 beta docs, subject to change before stable release |

---

## Summary

**Recommended Approach for CogVeri UI Refresh:**

1. **Keep TailwindCSS 3.4.x** - Stable, production-ready, wide ecosystem support
2. **Enhance with CSS Variables** - Prepare for v4, enable runtime theming
3. **Adopt Stripe's Accessible Color System** - WCAG 2.2 AA compliance, perceptually uniform
4. **Maintain Teal Brand Identity** - Already well-configured, enhance with semantic tokens
5. **Build Component Library** - Reusable Button, Card, Input components with TypeScript
6. **Follow Stripe/Notion Patterns** - Minimal color, high contrast, generous whitespace
7. **Use Inter Font** - Already implemented, excellent for UI/UX
8. **Prepare for v4 Migration** - Document tokens, use CSS variables, avoid deep `@apply`

This stack provides a solid foundation for a polished, professional SaaS UI that rivals Stripe and Notion in visual quality while maintaining accessibility and performance standards.
