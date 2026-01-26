# Feature Landscape: SaaS Dashboard UI Components

**Domain:** Video Analysis SaaS Dashboard (Stripe/Notion-level polish)
**Researched:** 2026-01-21
**Confidence:** MEDIUM-HIGH

## Executive Summary

Modern SaaS dashboards in 2026 have evolved beyond basic functionality. Users expect Stripe/Notion-level polish as **table stakes**, not a differentiator. A beautiful interface alone is baseline—success is measured by activation, retention, and time-to-value. This research categorizes UI components and patterns into three tiers: table stakes (must-have for professional look), differentiators (what elevates above generic), and anti-features (what to avoid).

**Key Finding:** 70% of SaaS churn is attributed to poor UX rather than missing features. Users in 2026 expect AI integration, command palettes, real-time updates, and mobile optimization as standard—not premium features.

---

## Table Stakes

Features users expect. Missing these = product feels incomplete or unprofessional.

### Core Component Patterns

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|---------------------|
| **Button states (5 states)** | Industry standard for interactive feedback | Low | Enabled, disabled, hover, focus, pressed. Hover at 150-200ms delay, focus at 100-150ms. Disabled with ARIA-disabled. |
| **Form validation (inline, real-time)** | Users expect instant feedback, not submit-time errors | Medium | Single-column forms, inline validation with contextual coaching. Color contrast 4.5:1 for text, 3:1 for icons (WCAG 2.1 AA). |
| **Cards (consistent styling)** | Standard container pattern for dashboards | Low | Consistent font size/style, background colors, spacing. Critical for scannability. Dashboard cards must display single metric or metric set. |
| **Data tables (sort, filter, pagination)** | Expected for any list/data view | High | Server-side pagination for large datasets. Column sorting (ascending/descending), search field, row selection. Use TanStack Table or Material React Table. |
| **Modals/Dialogs** | Standard for focused actions without page reload | Medium | Clear title (explains interruption), concise body (2-3 seconds to understand), prominent CTA. Exit via Escape key. One CTA maximum. |
| **Toast notifications** | Standard feedback for non-critical actions | Low | 3-8 second display time. Non-intrusive, edge placement. Use for confirmations, NOT critical alerts. Sonner library for React 18+. |
| **Dropdowns/Selects** | Basic form input pattern | Medium | Use for 7-15 options. Keyboard navigation (Tab, Arrow keys, Enter). Avoid for <3 options (use radio buttons). Mobile-optimized tap targets. |
| **Icons (consistent system)** | Visual language for actions and navigation | Medium | Single icon set with multiple styles (line, filled, color). Consistent size, shape, style across entire set. Hyper-minimal line icons trending in 2026. |
| **Loading states (skeleton screens)** | Users hate blank screens—expectations must be set | Medium | Skeleton screens with shimmer effect. Match layout of real content. Reduces perceived wait time, prevents CLS (Cumulative Layout Shift). |
| **Empty states (actionable)** | First-time users or deleted data scenarios | Low | Never show totally empty screens. Provide guidance on next steps. At minimum: assure nothing is broken. Best: inform and empower action. |

### Navigation Patterns

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|---------------------|
| **Responsive sidebar** | Standard dashboard navigation pattern | Medium | Collapsible to mini-drawer (icons only) on desktop/tablet. 3-5 primary destinations maximum. Bottom tabs for mobile (30-40% of mobile usability issues are navigation). |
| **Breadcrumbs (hierarchical)** | Expected for deep/complex structures | Low | Top-left placement, below header. Secondary navigation aid. Use for multi-level dashboards or settings. Current page not linked. |
| **Command palette (Cmd+K)** | Expected in modern SaaS (Notion, Figma, etc.) | High | Cmd+K or Cmd+P activation. Keyboard-first interaction. Search + action-based navigation. No longer a "nice-to-have" in 2026. |

### Data Visualization & Dashboard Patterns

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|---------------------|
| **Basic charts (bar, line, pie)** | Standard data presentation | Medium | Limit charts/widgets. Use white space. Most important metrics at top. 1-2 primary colors, 1 accent. WCAG color contrast. Never rely on color alone. |
| **Responsive/Mobile-first** | 68% of users access dashboards on mobile | High | Performance critical: >3s load = 50% abandonment. Test on mobile devices. Thumb-friendly tap targets. |
| **Interactivity (filters, drill-downs)** | Users expect to explore data, not just view | Medium | Click to filter, drill-down, hover for details. Decision-makers need deep-dive capabilities. |
| **Real-time updates** | Expected in 2026, especially for live data | High | WebSocket integration. Shifting from static reports to live feeds. Instant updates on key metrics. |

### Feedback Patterns

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|---------------------|
| **Alert/Banner messages** | Critical information display | Low | Use for important, persistent information. Toast notifications for transient. Banners for critical/persistent. |
| **Confirmation dialogs** | Prevent destructive actions | Low | Modal pattern. Clear explanation of consequence. Primary action should be high-contrast. |
| **Progress indicators** | System status visibility | Low | For running processes. Visual load skeletons for perceived speed. Lazy load components. |

### States & Micro-interactions

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|---------------------|
| **Hover states** | Visual affordance for interactivity | Low | Subtle but noticeable (color change, shadow). Consistent across all interactive elements. |
| **Focus states** | Keyboard navigation accessibility | Low | Visible focus indicators. WCAG 2.1 AA requirement. Essential for accessibility. |
| **Disabled states** | Prevent invalid actions, communicate unavailability | Low | Muted/dull appearance. Lower opacity common. ARIA-disabled attribute required. |
| **Loading states** | Communicate system processing | Low | Spinners, progress bars, skeleton screens. Never leave user wondering if system is working. |
| **Error states** | Form validation, API errors | Medium | Inline validation with clear error messages. Red/warning color with icon. Specific guidance on how to fix. |

---

## Differentiators

Features that set product apart. Not expected baseline, but highly valued when present.

### Advanced Patterns

| Feature | Value Proposition | Complexity | Implementation Notes |
|---------|-------------------|------------|---------------------|
| **AI-powered insights/recommendations** | Moves from "nice-to-have" to expectation in 2026 | Very High | Contextual recommendations, pattern recognition, automated insights. AI-assisted visualization (auto chart suggestions). Design for graceful AI errors—fallback experiences critical. |
| **Customizable dashboards** | Power users want personalization | High | Drag-and-drop widgets, rearrangeable layout, save personalized views. Filter data, custom metrics. Addresses "one-size-fits-none" problem. |
| **Advanced data viz (heat maps, radial charts, animations)** | Makes complex data more readable/actionable | High | Beyond bar/line/pie. Dynamic trend animations. Data storytelling with sequences. Requires design expertise to avoid clutter. |
| **Collaborative features (real-time multi-user)** | Especially valuable for team-based workflows | Very High | Real-time presence indicators, collaborative editing, shared views. Particularly impactful for video review workflows. |
| **Searchable/filterable dropdowns** | For extensive option lists | Medium | Auto-complete, auto-suggestion. Real-time search results. Valuable for large datasets (cities, products, etc.). |
| **Keyboard shortcuts (beyond Cmd+K)** | Power user efficiency | Medium | Documented shortcut system. Context-aware shortcuts. Increases productivity for daily users. Tooltip hints on hover. |
| **Dark mode** | User preference, reduces eye strain | Medium | Full theme system with proper contrast ratios. Not just inverted colors—redesigned for dark context. Growing expectation in 2026. |
| **Progressive disclosure (adaptive UI)** | Reduces cognitive load for complex products | High | Break workflows into guided steps. Reveal advanced features gradually. AI-driven adaptive interfaces (show frequently-used tools). 38% increase in feature adoption when well-implemented. |
| **Micro-interactions (purposeful)** | Positive reinforcement, reduced friction | Medium | 2026 trend: function over ornamentation. Hover states preview functionality, completion animations provide feedback, progress indicators show status. Avoid gratuitous animation. |
| **Data storytelling** | Guides users through insights | High | Animations and sequences that explain data journeys. Particularly effective for executive presentations. Abstract concepts made tangible. |
| **Undo/Redo with visual feedback** | Safety net for user actions | Medium | Especially important for destructive actions. Toast notification with "Undo" button pattern. Builds user confidence. |
| **Bulk actions** | Efficiency for managing multiple items | Medium | Multi-select with bulk operations. Critical for task management, video management. Table row selection with action bar. |
| **Export/Share capabilities** | Data portability and collaboration | Medium | CSV/PDF export, shareable links, embeds. Expected for reporting dashboards. |

### Design System Excellence

| Feature | Value Proposition | Complexity | Implementation Notes |
|---------|-------------------|------------|---------------------|
| **Micro-copy excellence** | Reduces confusion, builds trust | Low | Clear, concise labels. Avoid "Click here" ambiguity. Use active voice. Explain why modal appeared in 2-3 seconds. |
| **Contextual help (tooltips, onboarding)** | Reduces support burden, improves adoption | Medium | Tooltips for feature discovery. Checklists for onboarding. Progressive disclosure for complexity. AI-driven contextual assistance. |
| **Consistent spacing system** | Professional polish, visual harmony | Low | 4px/8px grid system standard. Consistent padding, margins, gaps. Part of design tokens. Prevents "off by 2px" inconsistency. |
| **Smooth transitions** | Perceived performance, polish | Medium | 200-300ms transitions standard. Easing functions for natural feel. CSS transform for performance. Avoid jarring layout shifts. |
| **Accessibility (WCAG 2.1 AA minimum)** | Legal requirement, inclusive design | High | Color contrast ratios (4.5:1 text, 3:1 non-text). Keyboard navigation. Screen reader support. Focus indicators. Not optional in 2026. |
| **Multi-viewport polish** | Consistency across devices | High | Not just "responsive"—optimized for mobile, tablet, desktop. Different interaction patterns per device (touch vs mouse). |

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

### Design Anti-Patterns

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Feature overload on dashboard** | Average SaaS dashboard shows 67 data points on first screen. Cognitive overload at 7±2 chunks. 61% of users report feeling overwhelmed. | Progressive disclosure. Show 3-5 key metrics prominently. Drill-down for details. Customizable dashboard lets users choose their 7±2. |
| **Hide-and-hover pattern** | Forces mouse exploration. Not keyboard-accessible. Users can't see available actions immediately. | Always-visible action buttons for primary actions. Secondary actions can be in overflow menu, but discoverable. |
| **Tiny click targets** | Frustrating, especially on mobile. Fails WCAG guidelines. | 44x44px minimum for touch, 24x24px for mouse. Thumb zone for mobile (bottom 1/3 of screen). |
| **Ambiguous labels** | "Click here", "Submit", "OK" provide no context. | Specific, action-oriented labels: "Upload Video", "Confirm Delete", "Save Settings". |
| **Critical info in toasts** | Toasts disappear. Users may miss entirely. | Toasts for confirmations only. Banners or modals for critical alerts. Never put destructive action confirmations in toasts. |
| **Dropdowns for 2-3 options** | Unnecessary interaction overhead. | Radio buttons or toggle switches. Dropdowns only for 7-15+ options. |
| **Blank loading screens** | Creates uncertainty. "Is it broken?" | Skeleton screens with shimmer. Shows structure while loading. Sets expectations. |
| **Too many CTAs in modal** | Decision paralysis. Confuses users. | One primary CTA (high contrast). Optional: one secondary/cancel action (muted). That's it. |
| **Cascading dropdowns** | Users don't understand dependencies. Frustrating when options disappear. | Independent filters with clear state. Or wizard-style stepped flow. |
| **Auto-playing videos/animations** | Annoying. Accessibility issue. Performance drain. | User-initiated only. Provide play button. Exception: subtle loading animations. |
| **Generic "Error occurred" messages** | Unhelpful. Increases support burden. | Specific error messages with actionable fix instructions. "Video file must be under 500MB" not "Upload failed". |

### Strategic Anti-Patterns

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Designing for internal opinions instead of users** | Most common UX mistake. Products shaped by sales/leadership, not actual user behavior. | User research and testing. Data-driven decisions. Watch real users struggle with your UI. |
| **Copying competitors' UI blindly** | Their UI might be bad too. Different product needs different UI. | Understand WHY competitors made choices. Test with your users. Adapt, don't copy. |
| **Feature dump on homepage** | Overwhelming. Increases bounce rate. Reduces clarity of value proposition. | Focus on 3-5 core value props. Progressive disclosure for feature discovery. |
| **Ignoring mobile** | 68% access dashboards on mobile. 50% abandon if >3s load time. | Mobile-first design. Performance budget. Test on real devices, not just browser resize. |
| **Skipping empty states** | First-time users see broken-looking interface. | Design-first empty states. Make them helpful and actionable. Show what user will see when they have data. |
| **Notification overload** | Users become blind to notifications. Support burden increases. | Reserve notifications for truly important events. Allow user control. Default to fewer, not more. |
| **Assuming AI is always right** | AI makes mistakes. Edge cases fail. | Design for graceful AI failures. Show confidence levels. Allow manual override. Maintain fallback experiences. |
| **Prioritizing aesthetics over clarity** | Beautiful but confusing = failure. 70% of churn from poor UX, not missing features. | Clarity first, beauty second. Test for comprehension speed. "Can user accomplish task in <30s?" |

### Accessibility Anti-Patterns

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Color-only differentiation** | Color-blind users can't distinguish. WCAG violation. | Icons, labels, patterns. Color as enhancement, not sole indicator. |
| **Missing focus indicators** | Keyboard users can't navigate. WCAG 2.1 AA requirement. Legal risk. | Visible focus rings on all interactive elements. High contrast. |
| **Non-descriptive ARIA labels** | Screen reader users confused. | Descriptive labels. "Delete video" not "Delete". Context matters. |
| **Auto-dismissing alerts** | Screen reader users may not hear before dismissal. | Persist alerts until user dismisses. Or very long timeout (30s+). |
| **Keyboard traps** | User gets stuck in modal/dropdown. | Tab order must allow escape. Escape key closes modals/dropdowns. |

---

## Feature Dependencies & Sequencing

### Foundation Layer (Build First)
```
Design Tokens (colors, spacing, typography)
  ↓
Basic Components (buttons, inputs, cards)
  ↓
Form Validation System
  ↓
Layout System (grid, spacing utilities)
```

### Interaction Layer (Build Second)
```
Loading States (spinners, skeletons)
  ↓
Empty States
  ↓
Feedback System (toasts, alerts)
  ↓
Modal/Dialog System
```

### Advanced Layer (Build Third)
```
Data Tables (requires: loading, empty, feedback)
  ↓
Dashboard Layout (requires: cards, charts, empty)
  ↓
Command Palette (requires: navigation, search)
  ↓
Progressive Disclosure (requires: full component library)
```

### Dependencies Critical Path
- **Skeleton Loading** requires knowing final component layouts → Build components first
- **Data Tables** require pagination, sorting, filtering, loading, empty states → Complex dependency chain
- **Command Palette** requires comprehensive action catalog → Build after core features exist
- **AI Features** require fallback UX → Build base UX first, AI as enhancement layer

---

## MVP Recommendation

For CogVeri video analysis SaaS MVP, prioritize in this order:

### Phase 1: Foundation (Week 1-2)
1. Design tokens system (colors, spacing, typography, shadows)
2. Button component (all 5 states)
3. Form inputs (text, select, checkbox) with inline validation
4. Card component (consistent styling)
5. Basic layout system (sidebar, main content area)

### Phase 2: Feedback & States (Week 3)
6. Toast notification system
7. Modal/dialog component
8. Loading states (spinner, skeleton screens)
9. Empty states (for video list, tasks, etc.)
10. Alert/banner component

### Phase 3: Data & Navigation (Week 4-5)
11. Data table (with sort, filter, pagination) - for video list, task list
12. Breadcrumb navigation
13. Responsive sidebar with collapse
14. Dropdown component (searchable for video selection)
15. Icon system (consistent set)

### Phase 4: Polish & Differentiation (Week 6+)
16. Video player controls (custom, not just HTML5 default)
17. Comment/feedback threads (for video review)
18. Real-time updates (WebSocket integration)
19. Bulk actions (for task/video management)
20. Command palette (power user feature)

### Defer to Post-MVP
- **Dark mode**: Nice-to-have, not critical for MVP validation
- **Advanced data viz**: Basic charts sufficient initially. Heat maps, animations later.
- **AI-powered insights**: Build base analysis first, AI enhancement in v2
- **Customizable dashboards**: Single optimized dashboard layout for MVP, customization after product-market fit
- **Keyboard shortcuts beyond Cmd+K**: Command palette first, individual shortcuts after user feedback
- **Progressive disclosure/adaptive UI**: Requires usage data. Build after MVP launch.

---

## CogVeri-Specific Recommendations

Based on the video analysis SaaS domain:

### Critical for Video Workflows
1. **Video player component** - Custom controls, timestamp comments, playback speed, frame-by-frame
2. **Timestamp-based comments** - Link feedback to specific video moments
3. **Annotation overlays** - Visual feedback on video frames
4. **Upload progress** - Large file handling with clear progress indication
5. **Transcription display** - Searchable, timestamp-linked text alongside video

### Dashboard for Task Assignment
1. **Task cards** - Status badges, assignee avatars, due dates, preview thumbnails
2. **Kanban/List view toggle** - Different users prefer different views
3. **Bulk task assignment** - Efficiency for multiple contributors
4. **Magic link generation** - One-click copy, QR code generation for mobile

### AI Analysis Display
1. **Rubric visualization** - Clear pass/fail indicators, score breakdown
2. **AI confidence levels** - Show when AI is uncertain
3. **Manual override UI** - Reviewers can adjust AI scoring
4. **Comparison view** - Side-by-side video comparison for quality checks

### Multi-tenancy Considerations
1. **Organization switcher** - If users belong to multiple orgs
2. **Role-based UI** - Show/hide features based on user role (owner, admin, reviewer, member)
3. **Permissions indicators** - Visual cues for locked/restricted features

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|-----------|-----------|
| **Core Components** | HIGH | Well-established patterns. Multiple authoritative sources (Material UI, Carbon Design, Stripe docs). Standards stable in 2026. |
| **Navigation Patterns** | HIGH | Stripe, Notion, Linear provide proven patterns. Cmd+K palette now industry standard. Mobile-first navigation well-documented. |
| **Data Visualization** | MEDIUM | Basic charts well-understood. Advanced viz (heat maps, animations) varies by implementation. Accessibility standards clear but design execution nuanced. |
| **AI Integration** | MEDIUM | Rapidly evolving. 2026 sources agree AI is expected, but implementation patterns still emerging. Graceful failure critical but not standardized. |
| **Feedback Patterns** | HIGH | Toast, modal, alert patterns mature. Accessibility requirements clear (WCAG 2.1 AA). Library ecosystem stable (Sonner, Radix). |
| **Anti-Patterns** | MEDIUM-HIGH | Well-documented pitfalls from UX research firms. Some sources cite specific stats (70% churn from UX, 67 data points on dashboards). Validated by multiple sources but survey methodology not always transparent. |
| **Video-Specific Components** | MEDIUM | Video player patterns established (YouTube, Vimeo). Timestamp commenting less standardized. Annotation overlays vary widely in implementation. |

---

## Sources

### Design Systems & Component Libraries
- [Stripe Dashboard Design System](https://docs.stripe.com/stripe-apps/design)
- [Stripe UI Components](https://docs.stripe.com/stripe-apps/components)
- [Carbon Design System](https://carbondesignsystem.com/)
- [Material UI Components](https://mui.com/material-ui/)
- [shadcn/ui](https://www.shadcn.io/)

### SaaS UI Best Practices (2026)
- [TailAdmin: SaaS Dashboard Templates 2026](https://tailadmin.com/blog/saas-dashboard-templates)
- [Top 12 SaaS Design Trends 2026](https://www.designstudiouiux.com/blog/top-saas-design-trends/)
- [SaaS Dashboard UX: Trends, Guidelines, & Fundamentals](https://arounda.agency/blog/saas-dashboard-ux-trends-guidelines-and-fundamentals)
- [SaaS UI/UX Best Practices 2026](https://www.krishaweb.com/blog/saas-ui-ux-best-practices-high-volume-conversions/)
- [B2B SaaS UX Design 2026](https://www.onething.design/post/b2b-saas-ux-design)

### Component-Specific Research
- [Button States: Communicate Interaction - Nielsen Norman Group](https://www.nngroup.com/articles/button-states-communicate-interaction/)
- [Button States Explained 2026](https://www.designrush.com/best-designs/websites/trends/button-states)
- [Modal UX Design for SaaS 2025-2026](https://userpilot.com/blog/modal-ux-design/)
- [Toast Notifications Best Practices - LogRocket](https://blog.logrocket.com/ux-design/toast-notifications/)
- [Data Table Component Patterns](https://carbondesignsystem.com/components/data-table/usage/)
- [Dropdown Design UX Best Practices](https://formsort.com/article/how-to-design-a-dropdown-field-in-a-form/)
- [Card UI Design Examples - Eleken](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- [Dashboard Cards Design Guidance - Baymard](https://baymard.com/blog/cards-dashboard-layout)

### Loading States & Empty States
- [Skeleton Loading Best Practices - LogRocket](https://blog.logrocket.com/handling-react-loading-states-react-loading-skeleton/)
- [Skeleton Screens 101 - Nielsen Norman Group](https://www.nngroup.com/articles/skeleton-screens/)
- [Empty State UX Examples - Pencil & Paper](https://www.pencilandpaper.io/articles/empty-states)
- [Empty State Interface Design - Nielsen Norman Group](https://www.nngroup.com/articles/empty-state-interface-design/)

### Navigation & Information Architecture
- [Mobile Navigation Patterns 2026](https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026)
- [Breadcrumbs UX Navigation - Pencil & Paper](https://www.pencilandpaper.io/articles/breadcrumbs-ux)
- [Command Palette UI Design - Mobbin](https://mobbin.com/glossary/command-palette)
- [SaaS Navigation Types Guide](https://www.merveilleux.design/en/blog/article/comprehensive-guide-for-saas-products-on-ux-navigation-types)

### Data Visualization
- [Data Visualization Dashboards 2026 - FineReport](https://www.fanruan.com/en/blog/data-visualization-dashboard-key-metrics)
- [Data Visualization Techniques 2026](https://sranalytics.io/blog/data-visualization-techniques/)
- [Data Visualization Trends 2026 - Ajelix](https://ajelix.com/data/data-visualization-trends/)

### Accessibility
- [Tooltip Accessibility - W3C WAI](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [Popover Accessibility](https://hidde.blog/popover-accessibility/)
- [Accessible Card UI Patterns](https://dap.berkeley.edu/web-a11y-basics/accessible-card-ui-component-patterns)

### Anti-Patterns & Pitfalls
- [11 Common UI/UX Design Mistakes 2026](https://www.ideapeel.com/blogs/ui-ux-design-mistakes-how-to-fix-them)
- [User Interface Anti-Patterns](https://ui-patterns.com/blog/User-Interface-AntiPatterns)
- [SaaS Dashboard Cognitive Overload](https://www.sanjaydey.com/saas-dashboard-design-information-architecture-cognitive-overload/)

### Progressive Disclosure & Complexity Management
- [Progressive Disclosure in SaaS UX](https://userpilot.com/blog/progressive-disclosure-examples/)
- [Power of Progressive Disclosure - Lollypop Design](https://lollypop.design/blog/2025/may/progressive-disclosure/)
- [Progressive Disclosure - Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)

### Icon & Visual Design
- [Icon Design Trends 2026 - Envato](https://elements.envato.com/learn/icon-design-trends)
- [Choosing Icon Sets for SaaS - Muzli](https://muz.li/blog/choosing-the-right-icon-set-for-saas-product-design/)

### Form Design & Validation
- [Form UI/UX Design Best Practices 2026](https://www.designstudiouiux.com/blog/form-ux-design-best-practices/)

### Badges, Pills, Tags
- [Badges vs Pills vs Chips vs Tags](https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/)
