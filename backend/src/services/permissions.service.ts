// import { prisma } from '../db/prisma'; // TODO: Not using Prisma - use Knex instead
import { db } from '../config/database';
import { logger } from '../utils/logger';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'CREATOR' | 'REVIEWER' | 'VIEWER' | 'LIMITED';

// Role hierarchy (numeric level)
const ROLE_HIERARCHY: Record<OrganizationRole, number> = {
  OWNER: 5,
  ADMIN: 4,
  CREATOR: 3,
  REVIEWER: 2,
  VIEWER: 1,
  LIMITED: 0,
};

// Permission matrix for each role
export const ROLE_PERMISSIONS: Record<OrganizationRole, Set<string>> = {
  OWNER: new Set([
    // Organization permissions
    'org:read',
    'org:update',
    'org:delete',
    'org:settings',
    'org:billing',

    // Member permissions
    'members:invite',
    'members:list',
    'members:update',
    'members:remove',
    'members:manage_roles',

    // Task permissions
    'tasks:create',
    'tasks:read',
    'tasks:update',
    'tasks:delete',
    'tasks:publish',
    'tasks:archive',

    // Recording permissions
    'recordings:read',
    'recordings:delete',
    'recordings:download',

    // Review permissions
    'reviews:read',
    'reviews:create',
    'reviews:update',
    'reviews:delete',
    'reviews:publish',

    // Admin permissions
    'admin:impersonate',
    'admin:audit_logs',
    'admin:api_access',
    'admin:invite_users',
  ]),

  ADMIN: new Set([
    // Organization permissions
    'org:read',
    'org:update',
    'org:settings',

    // Member permissions
    'members:invite',
    'members:list',
    'members:update',
    'members:remove',
    'members:manage_roles',

    // Task permissions
    'tasks:create',
    'tasks:read',
    'tasks:update',
    'tasks:delete',
    'tasks:publish',
    'tasks:archive',

    // Recording permissions
    'recordings:read',
    'recordings:delete',
    'recordings:download',

    // Review permissions
    'reviews:read',
    'reviews:create',
    'reviews:update',
    'reviews:delete',
    'reviews:publish',

    // Limited admin permissions
    'admin:audit_logs',
    'admin:api_access',
    'admin:invite_users',
  ]),

  CREATOR: new Set([
    // Organization permissions
    'org:read',

    // Member permissions
    'members:list',

    // Task permissions
    'tasks:create',
    'tasks:read',
    'tasks:update',
    'tasks:delete',
    'tasks:publish',
    'tasks:archive',

    // Recording permissions
    'recordings:read',
    'recordings:download',

    // Review permissions
    'reviews:read',
    'reviews:create',
    'reviews:update',
    'reviews:delete',
    'reviews:publish',
  ]),

  REVIEWER: new Set([
    // Organization permissions
    'org:read',

    // Member permissions
    'members:list',

    // Task permissions
    'tasks:read',

    // Recording permissions
    'recordings:read',
    'recordings:download',

    // Review permissions
    'reviews:read',
    'reviews:create',
    'reviews:update',
  ]),

  VIEWER: new Set([
    // Organization permissions
    'org:read',

    // Member permissions
    'members:list',

    // Task permissions
    'tasks:read',

    // Recording permissions
    'recordings:read',
    'recordings:download',

    // Review permissions
    'reviews:read',
  ]),

  LIMITED: new Set([
    // Organization permissions
    'org:read',

    // Member permissions
    'members:list',

    // Recording permissions (view only, no download)
    'recordings:read',
  ]),
};

// Resource-level permissions
export const RESOURCE_PERMISSIONS: Record<string, Record<string, string[]>> = {
  task: {
    owner_only: ['delete', 'publish', 'archive'],
    creator_only: ['update', 'delete'],
    viewer_all: ['read'],
  },
  recording: {
    owner_only: ['delete'],
    creator_only: ['download'],
    viewer_all: ['read'],
  },
  review: {
    owner_only: ['delete', 'publish'],
    creator_only: ['update', 'delete'],
    reviewer_only: ['create', 'update'],
    viewer_all: ['read'],
  },
};

export class PermissionsService {
  /**
   * Check if user has specific permission
   */
  async hasPermission(
    userId: string,
    organizationId: string,
    permission: string
  ): Promise<boolean> {
    try {
      // First check organization_members table (new multi-org model)
      const membership = await db('organization_members')
        .where('user_id', userId)
        .where('organization_id', organizationId)
        .where('status', 'active')
        .select('role')
        .first();

      let role: string | null = null;

      if (membership) {
        role = membership.role;
      } else {
        // Fallback to legacy users table (transition period)
        const user = await db('users')
          .where('id', userId)
          .where('organization_id', organizationId)
          .select('org_role')
          .first();

        if (user?.org_role) {
          role = user.org_role;
        }
      }

      if (!role) {
        return false;
      }

      // Normalize role to uppercase to match OrganizationRole enum
      const normalizedRole = role.toUpperCase() as OrganizationRole;

      // Check if role has the permission
      const permissions = ROLE_PERMISSIONS[normalizedRole];
      return permissions ? permissions.has(permission) : false;
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if user has any of the specified permissions (OR logic)
   */
  async hasAnyPermission(
    userId: string,
    organizationId: string,
    permissions: string[]
  ): Promise<boolean> {
    try {
      const userRole = await this.getUserRole(userId, organizationId);
      if (!userRole) return false;

      const rolePermissions = ROLE_PERMISSIONS[userRole];
      if (!rolePermissions) return false;

      return permissions.some((permission) => rolePermissions.has(permission));
    } catch (error) {
      logger.error('Error checking any permission:', error);
      return false;
    }
  }

  /**
   * Check if user has all specified permissions (AND logic)
   */
  async hasAllPermissions(
    userId: string,
    organizationId: string,
    permissions: string[]
  ): Promise<boolean> {
    try {
      const userRole = await this.getUserRole(userId, organizationId);
      if (!userRole) return false;

      const rolePermissions = ROLE_PERMISSIONS[userRole];
      if (!rolePermissions) return false;

      return permissions.every((permission) => rolePermissions.has(permission));
    } catch (error) {
      logger.error('Error checking all permissions:', error);
      return false;
    }
  }

  /**
   * Check if user has specific role
   */
  async hasRole(userId: string, organizationId: string, role: OrganizationRole): Promise<boolean> {
    try {
      const userRole = await this.getUserRole(userId, organizationId);
      if (!userRole) return false;

      // Check hierarchy: userRole >= requiredRole
      // e.g. OWNER (5) >= ADMIN (4) -> True
      return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[role];
    } catch (error) {
      logger.error('Error checking role:', error);
      return false;
    }
  }

  /**
   * Check if user has any of the specified roles
   */
  async hasAnyRole(
    userId: string,
    organizationId: string,
    roles: OrganizationRole[]
  ): Promise<boolean> {
    try {
      const userRole = await this.getUserRole(userId, organizationId);
      if (!userRole) return false;

      // Exact match check (not hierarchy) for specific role lists,
      // OR hierarchy check? Usually 'hasAnyRole' implies strict list membership.
      // But standard RBAC usually implies "at least this role".
      // Let's assume strict membership check for now, or use hierarchy if intended.
      // Given the name 'hasAnyRole' usually means "is one of these".
      return roles.includes(userRole);
    } catch (error) {
      logger.error('Error checking any role:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user in organization
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
    try {
      const role = await this.getUserRole(userId, organizationId);
      if (!role) return [];

      const permissions = ROLE_PERMISSIONS[role];
      return permissions ? Array.from(permissions) : [];
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Get user's role in organization
   */
  async getUserRole(userId: string, organizationId: string): Promise<OrganizationRole | null> {
    try {
      // First check organization_members table (new multi-org model)
      const membership = await db('organization_members')
        .where('user_id', userId)
        .where('organization_id', organizationId)
        .where('status', 'active')
        .select('role')
        .first();

      if (membership?.role) {
        return membership.role.toUpperCase() as OrganizationRole;
      }

      // Fallback to legacy users table (transition period)
      const user = await db('users')
        .where('id', userId)
        .where('organization_id', organizationId)
        .select('org_role')
        .first();

      if (!user || !user.org_role) return null;

      // Ensure uppercase return
      return user.org_role.toUpperCase() as OrganizationRole;
    } catch (error) {
      logger.error('Error getting user role:', error);
      return null;
    }
  }

  /**
   * Check if actor can manage target user (hierarchy check)
   */
  async canManageUser(actor: string, target: string, organizationId: string): Promise<boolean> {
    try {
      const actorRole = await this.getUserRole(actor, organizationId);
      const targetRole = await this.getUserRole(target, organizationId);

      if (!actorRole || !targetRole) return false;

      // Actor must have higher role than target
      return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
    } catch (error) {
      logger.error('Error checking if can manage user:', error);
      return false;
    }
  }

  /**
   * Check if actor can change target's role (hierarchy check)
   */
  async canChangeRole(
    actor: string,
    target: string,
    newRole: OrganizationRole,
    organizationId: string
  ): Promise<boolean> {
    try {
      const actorRole = await this.getUserRole(actor, organizationId);

      if (!actorRole) return false;

      // Actor must be at least ADMIN to change roles
      if (ROLE_HIERARCHY[actorRole] < ROLE_HIERARCHY['ADMIN']) return false;

      // Actor cannot assign a role higher than or equal to their own
      if (ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY[actorRole]) return false;

      // Check if actor can manage target (requires fetching target role first)
      // Optimization: Reuse canManageUser logic here if target needed
      const canManage = await this.canManageUser(actor, target, organizationId);
      return canManage;
    } catch (error) {
      logger.error('Error checking if can change role:', error);
      return false;
    }
  }

  /**
   * Check if user can delete resource
   */
  async canDeleteResource(
    userId: string,
    _resourceType: string,
    ownerId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      // Owner of resource can always delete (if they are still in org)
      if (userId === ownerId) return true;

      // Check if user is Admin/Owner of Organization
      const role = await this.getUserRole(userId, organizationId);
      if (!role) return false;

      // Admins and Owners can delete most resources
      if (role === 'OWNER' || role === 'ADMIN') return true;

      return false;
    } catch (error) {
      logger.error('Error checking if can delete resource:', error);
      return false;
    }
  }

  /**
   * Static method to get permission description
   */
  static getPermissionDescription(permission: string): string {
    const descriptions: Record<string, string> = {
      'org:read': 'View organization details',
      'org:update': 'Update organization settings',
      'org:delete': 'Delete organization',
      'org:settings': 'Manage organization settings',
      'org:billing': 'Manage billing and subscription',

      'members:invite': 'Invite new members',
      'members:list': 'View organization members',
      'members:update': 'Update member information',
      'members:remove': 'Remove members',
      'members:manage_roles': 'Change member roles',

      'tasks:create': 'Create tasks',
      'tasks:read': 'View tasks',
      'tasks:update': 'Edit tasks',
      'tasks:delete': 'Delete tasks',
      'tasks:publish': 'Publish tasks',
      'tasks:archive': 'Archive tasks',

      'recordings:read': 'View recordings',
      'recordings:delete': 'Delete recordings',
      'recordings:download': 'Download recordings',

      'reviews:read': 'View reviews',
      'reviews:create': 'Create reviews',
      'reviews:update': 'Edit reviews',
      'reviews:delete': 'Delete reviews',
      'reviews:publish': 'Publish reviews',

      'admin:impersonate': 'Impersonate users',
      'admin:audit_logs': 'View audit logs',
      'admin:api_access': 'API access',
      'admin:invite_users': 'Invite users to platform',
    };

    return descriptions[permission] || permission;
  }

  /**
   * Get all role descriptions
   */
  static getRoleDescriptions(): Record<OrganizationRole, string> {
    return {
      OWNER: 'Full control over organization',
      ADMIN: 'Administrative access except billing',
      CREATOR: 'Create and manage content',
      REVIEWER: 'Review and comment on content',
      VIEWER: 'Read-only access to all content',
      LIMITED: 'Restricted access - view recordings only',
    };
  }

  /**
   * Get all permissions for a role
   */
  static getRolePermissions(role: OrganizationRole): string[] {
    return Array.from(ROLE_PERMISSIONS[role]);
  }
}

export const permissionsService = new PermissionsService();
