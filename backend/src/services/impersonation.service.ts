import { db } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Impersonation session status
 */
export type ImpersonationStatus = 'active' | 'ended' | 'expired';

/**
 * Impersonation log entry
 */
export interface ImpersonationLog {
  id: string;
  organization_id: string;
  actor_id: string;
  target_user_id: string;
  started_at: Date;
  ended_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  status: ImpersonationStatus;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Data required to create an impersonation log
 */
export interface CreateImpersonationLogData {
  organizationId: string;
  actorId: string;
  targetUserId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Impersonation log with related user data
 */
export interface ImpersonationLogWithUsers extends ImpersonationLog {
  actor?: {
    id: string;
    email: string;
    name: string;
  };
  target_user?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Impersonation Service
 *
 * Provides audit trail functionality for admin impersonation sessions.
 * All impersonation activity is logged for security compliance.
 */
class ImpersonationService {
  /**
   * Create a new impersonation log entry
   *
   * @param data - Impersonation session data
   * @returns The created log ID
   */
  async createLog(data: CreateImpersonationLogData): Promise<string> {
    const [log] = await db('impersonation_logs')
      .insert({
        organization_id: data.organizationId,
        actor_id: data.actorId,
        target_user_id: data.targetUserId,
        ip_address: data.ipAddress || null,
        user_agent: data.userAgent || null,
        status: 'active',
        metadata: JSON.stringify(data.metadata || {}),
        started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id');

    logger.info(
      `Impersonation session created: actor=${data.actorId} target=${data.targetUserId} org=${data.organizationId}`
    );

    return log.id;
  }

  /**
   * End an active impersonation session
   *
   * @param id - The impersonation log ID
   */
  async endSession(id: string): Promise<void> {
    const now = new Date();

    const updated = await db('impersonation_logs')
      .where('id', id)
      .where('status', 'active')
      .update({
        status: 'ended',
        ended_at: now,
        updated_at: now,
      });

    if (updated > 0) {
      logger.info(`Impersonation session ended: ${id}`);
    } else {
      logger.warn(`Impersonation session not found or already ended: ${id}`);
    }
  }

  /**
   * Mark expired sessions (e.g., sessions that exceeded max duration)
   *
   * @param maxDurationMinutes - Maximum session duration in minutes
   */
  async expireStaleSessions(maxDurationMinutes: number = 60): Promise<number> {
    const cutoff = new Date(Date.now() - maxDurationMinutes * 60 * 1000);
    const now = new Date();

    const updated = await db('impersonation_logs')
      .where('status', 'active')
      .where('started_at', '<', cutoff)
      .update({
        status: 'expired',
        ended_at: now,
        updated_at: now,
      });

    if (updated > 0) {
      logger.info(`Expired ${updated} stale impersonation sessions`);
    }

    return updated;
  }

  /**
   * Get an impersonation log by ID
   *
   * @param id - The impersonation log ID
   * @returns The log entry or null if not found
   */
  async getById(id: string): Promise<ImpersonationLogWithUsers | null> {
    const log = await db('impersonation_logs')
      .where('impersonation_logs.id', id)
      .select('impersonation_logs.*')
      .first();

    if (!log) {
      return null;
    }

    // Fetch related user data
    const [actor, targetUser] = await Promise.all([
      db('users').where('id', log.actor_id).select('id', 'email', 'name').first(),
      db('users').where('id', log.target_user_id).select('id', 'email', 'name').first(),
    ]);

    return {
      ...log,
      actor,
      target_user: targetUser,
    };
  }

  /**
   * Get active impersonation session for an actor in an organization
   *
   * @param actorId - The actor's user ID
   * @param organizationId - The organization ID
   * @returns The active session or null
   */
  async getActiveByActor(
    actorId: string,
    organizationId: string
  ): Promise<ImpersonationLog | null> {
    return db('impersonation_logs')
      .where('actor_id', actorId)
      .where('organization_id', organizationId)
      .where('status', 'active')
      .orderBy('started_at', 'desc')
      .first();
  }

  /**
   * Get paginated impersonation logs for an organization
   *
   * @param organizationId - The organization ID
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @returns Logs and total count
   */
  async getOrgLogs(
    organizationId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ logs: ImpersonationLogWithUsers[]; total: number }> {
    const offset = (page - 1) * limit;

    // Get logs with pagination
    const logs = await db('impersonation_logs')
      .where('organization_id', organizationId)
      .orderBy('started_at', 'desc')
      .offset(offset)
      .limit(limit);

    // Get total count
    const countResult = await db('impersonation_logs')
      .where('organization_id', organizationId)
      .count('* as count')
      .first();

    const count = countResult?.count ?? 0;

    if (logs.length === 0) {
      return { logs: [], total: 0 };
    }

    // Fetch all unique user IDs
    const actorIds = [...new Set(logs.map((l) => l.actor_id))];
    const targetIds = [...new Set(logs.map((l) => l.target_user_id))];
    const allUserIds = [...new Set([...actorIds, ...targetIds])];

    // Batch fetch user data
    const users = await db('users').whereIn('id', allUserIds).select('id', 'email', 'name');

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Attach user data to logs
    const logsWithUsers = logs.map((log) => ({
      ...log,
      actor: userMap.get(log.actor_id),
      target_user: userMap.get(log.target_user_id),
    }));

    return {
      logs: logsWithUsers,
      total: Number(count),
    };
  }

  /**
   * Verify that the target user exists and is a member of the organization
   *
   * @param targetUserId - The target user ID
   * @param organizationId - The organization ID
   * @returns True if the target is valid
   */
  async verifyTargetUser(targetUserId: string, organizationId: string): Promise<boolean> {
    // Check in organization_members table
    const membership = await db('organization_members')
      .where('user_id', targetUserId)
      .where('organization_id', organizationId)
      .where('status', 'active')
      .first();

    if (membership) {
      return true;
    }

    // Fallback: check in users table (legacy single-org model)
    const user = await db('users')
      .where('id', targetUserId)
      .where('organization_id', organizationId)
      .where('org_status', 'active')
      .first();

    return !!user;
  }
}

export const impersonationService = new ImpersonationService();
