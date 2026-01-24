# SYSADMIN System Documentation

This document explains how the SYSADMIN (System Administrator) feature is implemented in CogVeri. Use this as a reference when creating features that should only be accessible to SYSADMIN users.

## Overview

SYSADMIN is a **hidden administrative role** that exists separately from regular organization roles (owner, admin, reviewer, member). It grants access to development/debugging features that regular users should never see or know about.

## Key Principles

1. **Primary Admin Control**: Only `admin@cogveri.com` (the "Primary Admin") can grant or revoke SYSADMIN status
2. **Completely Hidden**: Non-SYSADMIN users cannot see any SYSADMIN-related UI or know it exists
3. **Separate from Org Roles**: SYSADMIN is independent of organization membership roles
4. **Defense in Depth**: Backend checks both email AND system role for sensitive operations

## Database Schema

The SYSADMIN status is stored in the `users` table:

```sql
users:
  is_system_admin: boolean (default: false)
  system_role: varchar (e.g., 'SUPER_ADMIN' or null)
```

## Configuration Files

### Backend: `/backend/src/config/sysadmin.ts`
```typescript
// The ONLY user who can grant/revoke SYSADMIN
export const PRIMARY_ADMIN_EMAIL = 'admin@cogveri.com';

// System role values
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
```

### Frontend: `/frontend/src/config/sysadmin.ts`
```typescript
export const PRIMARY_ADMIN_EMAIL = 'admin@cogveri.com';

// Helper functions
export function isPrimaryAdmin(user): boolean;
export function isPrimaryAdminEmail(email: string): boolean;
export function isSystemAdmin(user): boolean;
```

## Backend Implementation

### Middleware: `/backend/src/middleware/system-admin.middleware.ts`

**Key middleware functions:**

1. **`requireSystemAdmin`** - Requires user to have SYSADMIN status
2. **`requirePrimaryAdmin`** - Requires user to be `admin@cogveri.com` AND have SYSADMIN

**Usage example:**
```typescript
import { requireSystemAdmin, requirePrimaryAdmin } from '../middleware/system-admin.middleware';

// Route only SYSADMIN can access
router.get('/debug/info', requireSystemAdmin, debugController.getInfo);

// Route only PRIMARY ADMIN can access (for granting SYSADMIN)
router.post('/admin/system-admins', requirePrimaryAdmin, adminController.grantSysadmin);
```

### API Endpoints

| Endpoint | Method | Middleware | Description |
|----------|--------|------------|-------------|
| `/admin/system-admins` | GET | requireSystemAdmin | List all SYSADMIN users |
| `/admin/system-admins` | POST | requirePrimaryAdmin | Grant SYSADMIN to user |
| `/admin/system-admins/:userId` | DELETE | requirePrimaryAdmin | Revoke SYSADMIN from user |

## Frontend Implementation

### Checking SYSADMIN Status

```typescript
import { isSystemAdmin, isPrimaryAdmin } from '../config/sysadmin';

// In a component
const { user } = useAuth();

// Check if user is any SYSADMIN
if (isSystemAdmin(user)) {
  // Show SYSADMIN-only features
}

// Check if user is the Primary Admin
if (isPrimaryAdmin(user)) {
  // Show Primary Admin-only features (like granting SYSADMIN)
}
```

### Hiding UI Elements

```tsx
// Only show to SYSADMIN users
{isSystemAdmin(user) && (
  <DebugPanel />
)}

// Only show to Primary Admin
{isPrimaryAdmin(user) && (
  <SysadminManagement />
)}
```

### Navigation Items (AdminLayout.tsx)

```typescript
const navItems = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  // ... other items
  {
    name: 'System Admins',
    path: '/admin/system-admins',
    icon: Shield,
    primaryAdminOnly: true  // Only visible to admin@cogveri.com
  },
];

// Filtering logic
const visibleItems = navItems.filter(item => {
  if (item.primaryAdminOnly && !isPrimaryAdmin(user)) return false;
  if (item.sysadminOnly && !isSystemAdmin(user)) return false;
  return true;
});
```

## Creating SYSADMIN-Only Features

### Step 1: Backend Route Protection

```typescript
// routes/my-feature.routes.ts
import { requireSystemAdmin } from '../middleware/system-admin.middleware';

router.use(requireSystemAdmin); // Protect all routes in this file

// Or protect individual routes
router.get('/sensitive', requireSystemAdmin, controller.sensitive);
```

### Step 2: Frontend Conditional Rendering

```tsx
// components/MyFeature.tsx
import { isSystemAdmin } from '../config/sysadmin';

export function MyFeature() {
  const { user } = useAuth();

  // Don't render anything for non-SYSADMIN
  if (!isSystemAdmin(user)) {
    return null;
  }

  return <div>SYSADMIN-only content</div>;
}
```

### Step 3: Navigation (if applicable)

```typescript
// In AdminLayout.tsx navItems array
{
  name: 'My SYSADMIN Feature',
  path: '/admin/my-feature',
  icon: Wrench,
  sysadminOnly: true,  // Hidden from non-SYSADMIN
}
```

## Security Considerations

1. **Never expose SYSADMIN status in public APIs** - Only admin endpoints should return this info
2. **Don't hint at SYSADMIN existence** - Error messages should be generic ("Not found" not "SYSADMIN required")
3. **Log SYSADMIN actions** - All grant/revoke operations should be logged
4. **Primary Admin cannot be demoted** - Backend prevents removing SYSADMIN from `admin@cogveri.com`

## Current SYSADMIN Users (Seed Data)

| Email | Name | SYSADMIN | Notes |
|-------|------|----------|-------|
| admin@cogveri.com | Paul Stevens | Yes | Primary Admin - cannot be demoted |
| ***REDACTED_EMAIL*** | ***REDACTED_NAME*** | No | Regular admin - can be granted SYSADMIN |

## Granting SYSADMIN Access

Only `admin@cogveri.com` can grant SYSADMIN:

1. Log in as `admin@cogveri.com`
2. Go to Admin Dashboard → System Admins
3. Click "Grant SYSADMIN" on a user
4. Confirm the action

## Testing SYSADMIN Features

```typescript
// In tests, mock the user with SYSADMIN status
const mockSysadmin = {
  id: 'test-id',
  email: 'test@example.com',
  is_system_admin: true,
  system_role: 'SUPER_ADMIN',
};

// Or use the actual Primary Admin email for Primary Admin tests
const mockPrimaryAdmin = {
  id: 'test-id',
  email: 'admin@cogveri.com',
  is_system_admin: true,
  system_role: 'SUPER_ADMIN',
};
```
