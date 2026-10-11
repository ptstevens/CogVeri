import { db } from '../config/database';
import { logger } from '../utils/logger';

export type TierAuditAction =
  'created' | 'updated' | 'archived' | 'reactivated' | 'stripe_synced' | 'price_changed';

export interface TierAuditEntry {
  id: string;
  tierName: string;
  action: TierAuditAction;
  actorId: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  stripeDetails: {
    productId?: string;
    priceIdMonthly?: string;
    priceIdYearly?: string;
    oldPriceId?: string;
    newPriceId?: string;
  } | null;
  createdAt: Date;
}

interface TierAuditLogRow {
  id: string;
  tier_name: string;
  action: string;
  actor_id: string | null;
  changes: string | Record<string, unknown> | null;
  stripe_details: string | Record<string, unknown> | null;
  created_at: Date;
}

/**
 * Tier Audit Service
 *
 * Tracks all changes to pricing tiers for auditing and compliance.
 * Separate from organization audit logs to focus on tier-level changes.
 */
class TierAuditService {
  /**
   * Log a tier action
   */
  async logTierAction(entry: {
    tierName: string;
    action: TierAuditAction;
    actorId?: string | null;
    changes?: Record<string, { from: unknown; to: unknown }> | null;
    stripeDetails?: TierAuditEntry['stripeDetails'];
  }): Promise<void> {
    try {
      await db('tier_audit_logs').insert({
        tier_name: entry.tierName,
        action: entry.action,
        actor_id: entry.actorId || null,
        changes: entry.changes ? JSON.stringify(entry.changes) : null,
        stripe_details: entry.stripeDetails ? JSON.stringify(entry.stripeDetails) : null,
        created_at: new Date(),
      });

      logger.info(`Tier audit logged: ${entry.action} on ${entry.tierName}`, {
        tierName: entry.tierName,
        action: entry.action,
        actorId: entry.actorId,
      });
    } catch (error) {
      logger.error('Error logging tier audit entry:', error);
      // Don't throw - audit logging should not break main operations
    }
  }

  /**
   * Get audit history for a specific tier
   */
  async getTierHistory(
    tierName: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ logs: TierAuditEntry[]; total: number }> {
    try {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      const [logs, countResult] = await Promise.all([
        db('tier_audit_logs')
          .where('tier_name', tierName)
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        db('tier_audit_logs').where('tier_name', tierName).count('* as count').first(),
      ]);

      return {
        logs: logs.map(this.mapRowToEntry),
        total: Number((countResult as { count: string })?.count ?? 0),
      };
    } catch (error) {
      logger.error(`Error getting tier history for ${tierName}:`, error);
      throw error;
    }
  }

  /**
   * Get all tier audit logs with filtering
   */
  async getAllAuditLogs(options?: {
    action?: TierAuditAction;
    tierName?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: TierAuditEntry[]; total: number }> {
    try {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      let query = db('tier_audit_logs');
      let countQuery = db('tier_audit_logs');

      if (options?.action) {
        query = query.where('action', options.action);
        countQuery = countQuery.where('action', options.action);
      }

      if (options?.tierName) {
        query = query.where('tier_name', options.tierName);
        countQuery = countQuery.where('tier_name', options.tierName);
      }

      if (options?.startDate) {
        query = query.where('created_at', '>=', options.startDate);
        countQuery = countQuery.where('created_at', '>=', options.startDate);
      }

      if (options?.endDate) {
        query = query.where('created_at', '<=', options.endDate);
        countQuery = countQuery.where('created_at', '<=', options.endDate);
      }

      const [logs, countResult] = await Promise.all([
        query.orderBy('created_at', 'desc').limit(limit).offset(offset),
        countQuery.count('* as count').first(),
      ]);

      return {
        logs: logs.map(this.mapRowToEntry),
        total: Number((countResult as { count: string })?.count ?? 0),
      };
    } catch (error) {
      logger.error('Error getting all tier audit logs:', error);
      throw error;
    }
  }

  /**
   * Map database row to TierAuditEntry
   */
  private mapRowToEntry(row: TierAuditLogRow): TierAuditEntry {
    return {
      id: row.id,
      tierName: row.tier_name,
      action: row.action as TierAuditAction,
      actorId: row.actor_id,
      changes: row.changes
        ? typeof row.changes === 'string'
          ? JSON.parse(row.changes)
          : row.changes
        : null,
      stripeDetails: row.stripe_details
        ? typeof row.stripe_details === 'string'
          ? JSON.parse(row.stripe_details)
          : row.stripe_details
        : null,
      createdAt: row.created_at,
    };
  }
}

export const tierAuditService = new TierAuditService();
export default tierAuditService;
