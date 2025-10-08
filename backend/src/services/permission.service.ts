import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError';

interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  level: number;
}

interface ResourceAccessRule {
  user_id: string;
  resource_type: string;
  resource_id: string;
  access_level: string;
}

class PermissionService {
  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    try {
      const result = await db('user_roles')
        .join('role_permissions', 'user_roles.role_id', 'role_permissions.role_id')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .where('user_roles.user_id', userId)
        .where('permissions.name', permissionName)
        .whereRaw('(user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())')
        .first();

      return !!result;
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(userId: string, permissionNames: string[]): Promise<boolean> {
    try {
      const result = await db('user_roles')
        .join('role_permissions', 'user_roles.role_id', 'role_permissions.role_id')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .where('user_roles.user_id', userId)
        .whereIn('permissions.name', permissionNames)
        .whereRaw('(user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())')
        .first();

      return !!result;
    } catch (error) {
      logger.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Check if user has all of the specified permissions
   */
  async hasAllPermissions(userId: string, permissionNames: string[]): Promise<boolean> {
    try {
      const result = await db('user_roles')
        .join('role_permissions', 'user_roles.role_id', 'role_permissions.role_id')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .where('user_roles.user_id', userId)
        .whereIn('permissions.name', permissionNames)
        .whereRaw('(user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())')
        .groupBy('user_roles.user_id')
        .havingRaw('COUNT(DISTINCT permissions.name) = ?', [permissionNames.length])
        .first();

      return !!result;
    } catch (error) {
      logger.error('Error checking all permissions:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      const permissions = await db('user_roles')
        .join('role_permissions', 'user_roles.role_id', 'role_permissions.role_id')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .where('user_roles.user_id', userId)
        .whereRaw('(user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())')
        .select('permissions.*')
        .distinct();

      return permissions;
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Get all roles for a user
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    try {
      const roles = await db('user_roles')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('user_roles.user_id', userId)
        .whereRaw('(user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())')
        .select('roles.*');

      return roles;
    } catch (error) {
      logger.error('Error getting user roles:', error);
      return [];
    }
  }

  /**
   * Check if user has access to a specific resource
   */
  async hasResourceAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    requiredLevel: string = 'view'
  ): Promise<boolean> {
    try {
      // First check direct resource access
      const directAccess = await db('resource_access')
        .where('user_id', userId)
        .where('resource_type', resourceType)
        .where('resource_id', resourceId)
        .whereRaw('(expires_at IS NULL OR expires_at > NOW())')
        .first();

      if (directAccess) {
        return this.compareAccessLevels(directAccess.access_level, requiredLevel);
      }

      // Check if user is admin or has override permissions
      const isAdmin = await this.hasPermission(userId, 'system.admin');
      if (isAdmin) return true;

      // Check resource-specific permissions
      const resourcePermission = `${resourceType}.${requiredLevel}.all`;
      if (await this.hasPermission(userId, resourcePermission)) {
        return true;
      }

      // For tasks, check if user is the assignee or reviewer
      if (resourceType === 'tasks') {
        const task = await db('tasks')
          .where('id', resourceId)
          .first();

        if (task) {
          // User is assignee
          if (task.assigned_to === userId) {
            const canAccessAssigned = await this.hasPermission(userId, 'tasks.view.assigned');
            if (canAccessAssigned) return true;
          }

          // User is reviewer
          if (task.reviewer_id === userId) {
            const canReview = await this.hasPermission(userId, 'tasks.review');
            if (canReview) return true;
          }

          // User created the task
          if (task.created_by === userId) {
            return true;
          }
        }
      }

      // Check team-based access
      const teamAccess = await this.checkTeamAccess(userId, resourceType, resourceId);
      if (teamAccess) return true;

      return false;
    } catch (error) {
      logger.error('Error checking resource access:', error);
      return false;
    }
  }

  /**
   * Check team-based access
   */
  private async checkTeamAccess(
    userId: string,
    resourceType: string,
    resourceId: string
  ): Promise<boolean> {
    try {
      // Get user's teams
      const userTeams = await db('team_members')
        .where('user_id', userId)
        .select('team_id', 'role');

      if (userTeams.length === 0) return false;

      const teamIds = userTeams.map(t => t.team_id);

      // Check if resource belongs to any of user's teams
      // This is a simplified check - extend based on your team structure
      if (resourceType === 'tasks') {
        const task = await db('tasks')
          .where('id', resourceId)
          .whereIn('team_id', teamIds)
          .first();

        if (task) {
          // Check team permissions
          const hasTeamPermission = await this.hasPermission(userId, 'tasks.view.team');
          return hasTeamPermission;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking team access:', error);
      return false;
    }
  }

  /**
   * Compare access levels
   */
  private compareAccessLevels(userLevel: string, requiredLevel: string): boolean {
    const levels: Record<string, number> = {
      none: 0,
      view: 1,
      edit: 2,
      admin: 3,
    };

    return levels[userLevel] >= levels[requiredLevel];
  }

  /**
   * Grant resource access to a user
   */
  async grantResourceAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    accessLevel: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    try {
      await db('resource_access')
        .insert({
          user_id: userId,
          resource_type: resourceType,
          resource_id: resourceId,
          access_level: accessLevel,
          granted_by: grantedBy,
          granted_at: new Date(),
          expires_at: expiresAt,
        })
        .onConflict(['user_id', 'resource_type', 'resource_id'])
        .merge();

      // Log the action
      await this.logAction(grantedBy, 'grant_access', resourceType, resourceId, {
        target_user: userId,
        access_level: accessLevel,
      });
    } catch (error) {
      logger.error('Error granting resource access:', error);
      throw error;
    }
  }

  /**
   * Revoke resource access
   */
  async revokeResourceAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    revokedBy: string
  ): Promise<void> {
    try {
      await db('resource_access')
        .where('user_id', userId)
        .where('resource_type', resourceType)
        .where('resource_id', resourceId)
        .delete();

      // Log the action
      await this.logAction(revokedBy, 'revoke_access', resourceType, resourceId, {
        target_user: userId,
      });
    } catch (error) {
      logger.error('Error revoking resource access:', error);
      throw error;
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleId: string, assignedBy: string, expiresAt?: Date): Promise<void> {
    try {
      await db('user_roles').insert({
        user_id: userId,
        role_id: roleId,
        assigned_by: assignedBy,
        assigned_at: new Date(),
        expires_at: expiresAt,
      });

      // Log the action
      await this.logAction(assignedBy, 'assign_role', 'user', userId, {
        role_id: roleId,
      });
    } catch (error) {
      logger.error('Error assigning role:', error);
      throw error;
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string, removedBy: string): Promise<void> {
    try {
      await db('user_roles')
        .where('user_id', userId)
        .where('role_id', roleId)
        .delete();

      // Log the action
      await this.logAction(removedBy, 'remove_role', 'user', userId, {
        role_id: roleId,
      });
    } catch (error) {
      logger.error('Error removing role:', error);
      throw error;
    }
  }

  /**
   * Log action to audit trail
   */
  private async logAction(
    userId: string,
    action: string,
    resourceType: string | null,
    resourceId: string | null,
    details: any = {}
  ): Promise<void> {
    try {
      await db('audit_log').insert({
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: JSON.stringify(details),
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error logging action:', error);
      // Don't throw - logging should not break main flow
    }
  }

  /**
   * Filter query based on user permissions
   */
  async filterQueryByPermissions(
    query: any,
    userId: string,
    resourceType: string
  ): Promise<any> {
    try {
      // Check if user has view all permission
      const canViewAll = await this.hasPermission(userId, `${resourceType}.view.all`);
      if (canViewAll) {
        return query; // No filtering needed
      }

      // Check if user can view team resources
      const canViewTeam = await this.hasPermission(userId, `${resourceType}.view.team`);
      if (canViewTeam) {
        // Get user's teams
        const userTeams = await db('team_members')
          .where('user_id', userId)
          .select('team_id');

        const teamIds = userTeams.map(t => t.team_id);

        if (teamIds.length > 0) {
          query = query.where(function() {
            this.whereIn('team_id', teamIds)
              .orWhere('assigned_to', userId)
              .orWhere('created_by', userId)
              .orWhere('reviewer_id', userId);
          });
          return query;
        }
      }

      // Check if user can only view assigned
      const canViewAssigned = await this.hasPermission(userId, `${resourceType}.view.assigned`);
      if (canViewAssigned) {
        query = query.where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewer_id', userId);
        });
        return query;
      }

      // Default: only own resources
      query = query.where('created_by', userId);
      return query;
    } catch (error) {
      logger.error('Error filtering query by permissions:', error);
      // Return most restrictive filter on error
      return query.where('created_by', userId);
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    return await this.hasAnyPermission(userId, ['system.admin', 'tasks.view.all']);
  }

  /**
   * Check if user is reviewer
   */
  async isReviewer(userId: string): Promise<boolean> {
    return await this.hasPermission(userId, 'tasks.review');
  }
}

export default new PermissionService();