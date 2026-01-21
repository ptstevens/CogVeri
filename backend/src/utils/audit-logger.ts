import { db } from '../config/database';
import { logger } from './logger';

/**
 * Audit Logger Utility
 * Centralized audit logging for all organization actions
 * Ensures consistent logging across the platform
 */

export enum AuditActionType {
  // Organization actions
  ORGANIZATION_CREATED = 'organization_created',
  ORGANIZATION_UPDATED = 'organization_updated',
  ORGANIZATION_DELETED = 'organization_deleted',
  ORGANIZATION_SUSPENDED = 'organization_suspended',
  ORGANIZATION_UNSUSPENDED = 'organization_unsuspended',

  // Subscription actions
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
  SUBSCRIPTION_TIER_CHANGED = 'subscription_tier_changed',

  // Member actions
  MEMBER_INVITED = 'member_invited',
  MEMBER_JOINED = 'member_joined',
  MEMBER_REMOVED = 'member_removed',
  MEMBER_ROLE_CHANGED = 'member_role_changed',
  MEMBER_PERMISSIONS_UPDATED = 'member_permissions_updated',

  // Recording actions
  RECORDING_CREATED = 'recording_created',
  RECORDING_UPDATED = 'recording_updated',
  RECORDING_DELETED = 'recording_deleted',
  RECORDING_SHARED = 'recording_shared',
  RECORDING_ARCHIVED = 'recording_archived',

  // Task actions
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_DELETED = 'task_deleted',
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',

  // Review actions
  REVIEW_CREATED = 'review_created',
  REVIEW_UPDATED = 'review_updated',
  REVIEW_DELETED = 'review_deleted',
  REVIEW_SUBMITTED = 'review_submitted',
  REVIEW_APPROVED = 'review_approved',
  REVIEW_REJECTED = 'review_rejected',

  // Domain verification actions
  DOMAIN_VERIFICATION_REQUESTED = 'domain_verification_requested',
  DOMAIN_VERIFICATION_COMPLETED = 'domain_verification_completed',
  DOMAIN_VERIFICATION_FAILED = 'domain_verification_failed',

  // API & Security actions
  API_KEY_CREATED = 'api_key_created',
  API_KEY_DELETED = 'api_key_deleted',
  LOGIN = 'login',
  LOGOUT = 'logout',
  PASSWORD_CHANGED = 'password_changed',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',

  // Admin actions
  ADMIN_IMPERSONATION_STARTED = 'admin_impersonation_started',
  ADMIN_IMPERSONATION_ENDED = 'admin_impersonation_ended',
  SYSTEM_SETTING_CHANGED = 'system_setting_changed',
}

export enum AuditResourceType {
  ORGANIZATION = 'organization',
  SUBSCRIPTION = 'subscription',
  USER = 'user',
  RECORDING = 'recording',
  TASK = 'task',
  REVIEW = 'review',
  DOMAIN = 'domain',
  API_KEY = 'api_key',
  INVITE = 'invite',
}

export interface AuditLogEntry {
  organizationId: string;
  actorId?: string; // User ID of who performed the action
  action: AuditActionType;
  resourceType: AuditResourceType;
  resourceId?: string; // Optional - may not be known for some actions (e.g., inviting new user)
  changes?: Record<string, any>; // What changed
  metadata?: Record<string, any>; // Additional context
  status: 'success' | 'failure';
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an organization action to the audit log
 */
export async function logAuditAction(entry: AuditLogEntry): Promise<void> {
  try {
    await db('organization_audit_logs').insert({
      organization_id: entry.organizationId,
      actor_id: entry.actorId,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      changes: entry.changes ? JSON.stringify(entry.changes) : null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      status: entry.status,
      error_message: entry.errorMessage,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      created_at: new Date(),
    });
  } catch (error) {
    logger.error('Error logging audit action:', error);
    // Don't throw - audit logging failures shouldn't break the main operation
  }
}

/**
 * Log organization created action
 */
export async function logOrganizationCreated(
  organizationId: string,
  organizationData: any,
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.ORGANIZATION_CREATED,
    resourceType: AuditResourceType.ORGANIZATION,
    resourceId: organizationId,
    metadata: {
      name: organizationData.name,
      domain: organizationData.domain,
    },
    status: 'success',
  });
}

/**
 * Log organization updated action
 */
export async function logOrganizationUpdated(
  organizationId: string,
  changes: Record<string, any>,
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.ORGANIZATION_UPDATED,
    resourceType: AuditResourceType.ORGANIZATION,
    resourceId: organizationId,
    changes,
    status: 'success',
  });
}

/**
 * Log member invited action
 */
export async function logMemberInvited(
  organizationId: string,
  inviteeEmail: string,
  inviteeId?: string,
  role: string = 'MEMBER',
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.MEMBER_INVITED,
    resourceType: AuditResourceType.USER,
    // Only pass inviteeId if it's a valid UUID - email is stored in metadata
    // resource_id column is UUID type, so passing email string would cause error
    resourceId: inviteeId,
    metadata: {
      email: inviteeEmail,
      role,
      inviteeId,
    },
    status: 'success',
  });
}

/**
 * Log member removed action
 */
export async function logMemberRemoved(
  organizationId: string,
  userId: string,
  actorId?: string
): Promise<void> {
  const user = await db('users').where('id', userId).select('email').first();

  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.MEMBER_REMOVED,
    resourceType: AuditResourceType.USER,
    resourceId: userId,
    metadata: {
      email: user?.email,
    },
    status: 'success',
  });
}

/**
 * Log member role changed action
 */
export async function logMemberRoleChanged(
  organizationId: string,
  userId: string,
  oldRole: string,
  newRole: string,
  actorId?: string
): Promise<void> {
  const user = await db('users').where('id', userId).select('email').first();

  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.MEMBER_ROLE_CHANGED,
    resourceType: AuditResourceType.USER,
    resourceId: userId,
    changes: {
      role: { from: oldRole, to: newRole },
    },
    metadata: {
      email: user?.email,
    },
    status: 'success',
  });
}

/**
 * Log recording created action
 */
export async function logRecordingCreated(
  organizationId: string,
  recordingId: string,
  recordingName: string,
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.RECORDING_CREATED,
    resourceType: AuditResourceType.RECORDING,
    resourceId: recordingId,
    metadata: {
      name: recordingName,
    },
    status: 'success',
  });
}

/**
 * Log recording deleted action
 */
export async function logRecordingDeleted(
  organizationId: string,
  recordingId: string,
  recordingName: string,
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.RECORDING_DELETED,
    resourceType: AuditResourceType.RECORDING,
    resourceId: recordingId,
    metadata: {
      name: recordingName,
    },
    status: 'success',
  });
}

/**
 * Log task created action
 */
export async function logTaskCreated(
  organizationId: string,
  taskId: string,
  taskName: string,
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.TASK_CREATED,
    resourceType: AuditResourceType.TASK,
    resourceId: taskId,
    metadata: {
      name: taskName,
    },
    status: 'success',
  });
}

/**
 * Log subscription tier changed action
 */
export async function logSubscriptionTierChanged(
  organizationId: string,
  oldTier: string,
  newTier: string,
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.SUBSCRIPTION_TIER_CHANGED,
    resourceType: AuditResourceType.SUBSCRIPTION,
    resourceId: organizationId,
    changes: {
      subscriptionTier: { from: oldTier, to: newTier },
    },
    status: 'success',
  });
}

/**
 * Log domain verification completed action
 */
export async function logDomainVerificationCompleted(
  organizationId: string,
  domain: string,
  method: 'email' | 'dns',
  actorId?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId,
    action: AuditActionType.DOMAIN_VERIFICATION_COMPLETED,
    resourceType: AuditResourceType.DOMAIN,
    resourceId: domain,
    metadata: {
      domain,
      verificationMethod: method,
    },
    status: 'success',
  });
}

/**
 * Log login action
 */
export async function logLogin(
  organizationId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId: userId,
    action: AuditActionType.LOGIN,
    resourceType: AuditResourceType.USER,
    resourceId: userId,
    status: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log logout action
 */
export async function logLogout(
  organizationId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId: userId,
    action: AuditActionType.LOGOUT,
    resourceType: AuditResourceType.USER,
    resourceId: userId,
    status: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log admin impersonation started action
 */
export async function logAdminImpersonationStarted(
  organizationId: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditAction({
    organizationId,
    actorId: adminId,
    action: AuditActionType.ADMIN_IMPERSONATION_STARTED,
    resourceType: AuditResourceType.ORGANIZATION,
    resourceId: organizationId,
    metadata: {
      adminId,
    },
    status: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Get audit logs for organization
 */
export async function getOrganizationAuditLogs(
  organizationId: string,
  options: {
    limit?: number;
    offset?: number;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  logs: any[];
  total: number;
}> {
  try {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let query = db('organization_audit_logs').where('organization_id', organizationId);

    if (options.action) {
      query = query.where('action', 'ilike', `%${options.action}%`);
    }

    if (options.resourceType) {
      query = query.where('resource_type', options.resourceType);
    }

    if (options.startDate) {
      query = query.where('created_at', '>=', options.startDate);
    }

    if (options.endDate) {
      query = query.where('created_at', '<=', options.endDate);
    }

    // Get count
    const countResult = await query
      .clone()
      .count('id as count')
      .first();
    const total = parseInt(countResult?.count?.toString() || '0');

    // Get paginated logs
    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('*');

    // Enrich with actor info
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const actor = log.actor_id
          ? await db('users').where('id', log.actor_id).select('email', 'name').first()
          : null;

        return {
          id: log.id,
          action: log.action,
          resourceType: log.resource_type,
          resourceId: log.resource_id,
          actor: actor
            ? {
                id: log.actor_id,
                email: actor.email,
                name: actor.name || actor.email,
              }
            : null,
          changes: log.changes ? JSON.parse(log.changes) : null,
          metadata: log.metadata ? JSON.parse(log.metadata) : null,
          status: log.status,
          errorMessage: log.error_message,
          ipAddress: log.ip_address,
          createdAt: log.created_at,
        };
      })
    );

    return {
      logs: enriched,
      total,
    };
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    throw error;
  }
}
