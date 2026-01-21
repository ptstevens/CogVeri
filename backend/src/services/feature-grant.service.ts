import { db } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError } from '../utils/AppError';

export interface FeatureGrant {
  id: string;
  organizationId: string;
  featureName: string;
  grantedAt: Date;
  expiresAt: Date;
  grantedBy: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  reason: string | null;
  createdAt: Date;
}

interface FeatureGrantRow {
  id: string;
  organization_id: string;
  feature_name: string;
  granted_at: Date;
  expires_at: Date;
  granted_by: string | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  reason: string | null;
  created_at: Date;
}

/**
 * Feature Grant Service
 *
 * Manages time-limited feature grants for organizations.
 * Grants override tier defaults, allowing features to be enabled
 * for a specific duration regardless of the org's subscription tier.
 */
class FeatureGrantService {
  /**
   * Grant a feature to an organization
   */
  async grantFeature(
    organizationId: string,
    featureName: string,
    expiresAt: Date,
    grantedBy: string,
    reason?: string
  ): Promise<FeatureGrant> {
    try {
      // Check if there's already an active grant for this feature
      const existingGrant = await db('organization_feature_grants')
        .where('organization_id', organizationId)
        .where('feature_name', featureName)
        .whereNull('revoked_at')
        .first();

      if (existingGrant) {
        throw new ConflictError(
          `Organization already has an active grant for feature "${featureName}". ` +
          'Please revoke the existing grant first or extend it.'
        );
      }

      // Validate expiration date
      if (expiresAt <= new Date()) {
        throw new Error('Expiration date must be in the future');
      }

      // Create the grant
      const [grant] = await db('organization_feature_grants')
        .insert({
          organization_id: organizationId,
          feature_name: featureName,
          expires_at: expiresAt,
          granted_by: grantedBy,
          reason: reason || null,
          granted_at: new Date(),
          created_at: new Date(),
        })
        .returning('*');

      // Log audit
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        actor_id: grantedBy,
        action: 'feature_grant_created',
        resource_type: 'feature_grant',
        resource_id: grant.id,
        changes: JSON.stringify({
          featureName,
          expiresAt: expiresAt.toISOString(),
          reason,
        }),
        status: 'success',
        created_at: new Date(),
      });

      logger.info(`Feature grant created: ${featureName} for org ${organizationId}`, {
        grantId: grant.id,
        organizationId,
        featureName,
        expiresAt,
        grantedBy,
      });

      return this.mapRowToGrant(grant);
    } catch (error) {
      logger.error('Error creating feature grant:', error);
      throw error;
    }
  }

  /**
   * Revoke a feature grant
   */
  async revokeGrant(
    grantId: string,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      const grant = await db('organization_feature_grants')
        .where('id', grantId)
        .whereNull('revoked_at')
        .first();

      if (!grant) {
        throw new NotFoundError('Feature grant not found or already revoked');
      }

      await db('organization_feature_grants')
        .where('id', grantId)
        .update({
          revoked_at: new Date(),
          revoked_by: revokedBy,
          reason: reason ? `${grant.reason || ''} | Revoked: ${reason}`.trim() : grant.reason,
        });

      // Log audit
      await db('organization_audit_logs').insert({
        organization_id: grant.organization_id,
        actor_id: revokedBy,
        action: 'feature_grant_revoked',
        resource_type: 'feature_grant',
        resource_id: grantId,
        changes: JSON.stringify({
          featureName: grant.feature_name,
          revokedReason: reason,
        }),
        status: 'success',
        created_at: new Date(),
      });

      logger.info(`Feature grant revoked: ${grantId}`, {
        grantId,
        organizationId: grant.organization_id,
        featureName: grant.feature_name,
        revokedBy,
      });
    } catch (error) {
      logger.error('Error revoking feature grant:', error);
      throw error;
    }
  }

  /**
   * Get all active grants for an organization
   */
  async getActiveGrants(organizationId: string): Promise<FeatureGrant[]> {
    try {
      const grants = await db('organization_feature_grants')
        .where('organization_id', organizationId)
        .whereNull('revoked_at')
        .where('expires_at', '>', new Date())
        .orderBy('expires_at', 'asc');

      return grants.map(this.mapRowToGrant);
    } catch (error) {
      logger.error(`Error getting active grants for org ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Get grant history for an organization
   */
  async getGrantHistory(
    organizationId: string,
    options?: {
      includeExpired?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ grants: FeatureGrant[]; total: number }> {
    try {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      let query = db('organization_feature_grants')
        .where('organization_id', organizationId);

      let countQuery = db('organization_feature_grants')
        .where('organization_id', organizationId);

      if (!options?.includeExpired) {
        // Only show active or recently revoked grants
        query = query.where(function (this: ReturnType<typeof db>) {
          this.whereNull('revoked_at')
            .orWhere('revoked_at', '>', db.raw("NOW() - INTERVAL '30 days'"));
        });
        countQuery = countQuery.where(function (this: ReturnType<typeof db>) {
          this.whereNull('revoked_at')
            .orWhere('revoked_at', '>', db.raw("NOW() - INTERVAL '30 days'"));
        });
      }

      const [grants, countResult] = await Promise.all([
        query.orderBy('created_at', 'desc').limit(limit).offset(offset),
        countQuery.count('* as count').first(),
      ]);

      return {
        grants: grants.map(this.mapRowToGrant),
        total: Number((countResult as { count: string })?.count ?? 0),
      };
    } catch (error) {
      logger.error(`Error getting grant history for org ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Check if an organization has an active grant for a feature
   */
  async hasActiveGrant(organizationId: string, featureName: string): Promise<boolean> {
    try {
      const grant = await db('organization_feature_grants')
        .where('organization_id', organizationId)
        .where('feature_name', featureName)
        .whereNull('revoked_at')
        .where('expires_at', '>', new Date())
        .first();

      return !!grant;
    } catch (error) {
      logger.error(`Error checking active grant for org ${organizationId}, feature ${featureName}:`, error);
      return false;
    }
  }

  /**
   * Get all active feature names for an organization
   */
  async getActiveGrantedFeatures(organizationId: string): Promise<string[]> {
    try {
      const grants = await db('organization_feature_grants')
        .where('organization_id', organizationId)
        .whereNull('revoked_at')
        .where('expires_at', '>', new Date())
        .select('feature_name');

      return grants.map((g: { feature_name: string }) => g.feature_name);
    } catch (error) {
      logger.error(`Error getting active granted features for org ${organizationId}:`, error);
      return [];
    }
  }

  /**
   * Get grants expiring within the specified hours
   * Used for sending expiration reminders
   */
  async getExpiringGrants(withinHours: number): Promise<FeatureGrant[]> {
    try {
      const expirationThreshold = new Date();
      expirationThreshold.setHours(expirationThreshold.getHours() + withinHours);

      const grants = await db('organization_feature_grants')
        .whereNull('revoked_at')
        .where('expires_at', '>', new Date())
        .where('expires_at', '<=', expirationThreshold)
        .orderBy('expires_at', 'asc');

      return grants.map(this.mapRowToGrant);
    } catch (error) {
      logger.error('Error getting expiring grants:', error);
      throw error;
    }
  }

  /**
   * Process expired grants
   * This is called by a scheduled job to clean up expired grants
   */
  async processExpiredGrants(): Promise<{ processed: number; errors: string[] }> {
    const result = { processed: 0, errors: [] as string[] };

    try {
      // Find all expired but not yet revoked grants
      const expiredGrants = await db('organization_feature_grants')
        .whereNull('revoked_at')
        .where('expires_at', '<=', new Date())
        .select('id', 'organization_id', 'feature_name');

      for (const grant of expiredGrants) {
        try {
          // Mark as expired (revoked by system)
          await db('organization_feature_grants')
            .where('id', grant.id)
            .update({
              revoked_at: new Date(),
              revoked_by: null, // System action
              reason: (db.raw(`COALESCE(reason, '') || ' | Expired automatically'`)),
            });

          // Log audit
          await db('organization_audit_logs').insert({
            organization_id: grant.organization_id,
            actor_id: null, // System action
            action: 'feature_grant_expired',
            resource_type: 'feature_grant',
            resource_id: grant.id,
            changes: JSON.stringify({
              featureName: grant.feature_name,
            }),
            status: 'success',
            created_at: new Date(),
          });

          result.processed++;
        } catch (error) {
          const errorMsg = `Failed to process grant ${grant.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, error);
        }
      }

      if (result.processed > 0) {
        logger.info(`Processed ${result.processed} expired feature grants`);
      }

      return result;
    } catch (error) {
      logger.error('Error processing expired grants:', error);
      throw error;
    }
  }

  /**
   * Extend a grant's expiration
   */
  async extendGrant(
    grantId: string,
    newExpiresAt: Date,
    extendedBy: string
  ): Promise<FeatureGrant> {
    try {
      const grant = await db('organization_feature_grants')
        .where('id', grantId)
        .whereNull('revoked_at')
        .first();

      if (!grant) {
        throw new NotFoundError('Feature grant not found or already revoked');
      }

      if (newExpiresAt <= new Date()) {
        throw new Error('New expiration date must be in the future');
      }

      if (newExpiresAt <= grant.expires_at) {
        throw new Error('New expiration date must be after the current expiration');
      }

      const [updatedGrant] = await db('organization_feature_grants')
        .where('id', grantId)
        .update({
          expires_at: newExpiresAt,
        })
        .returning('*');

      // Log audit
      await db('organization_audit_logs').insert({
        organization_id: grant.organization_id,
        actor_id: extendedBy,
        action: 'feature_grant_extended',
        resource_type: 'feature_grant',
        resource_id: grantId,
        changes: JSON.stringify({
          featureName: grant.feature_name,
          previousExpiration: grant.expires_at,
          newExpiration: newExpiresAt,
        }),
        status: 'success',
        created_at: new Date(),
      });

      logger.info(`Feature grant extended: ${grantId}`, {
        grantId,
        organizationId: grant.organization_id,
        featureName: grant.feature_name,
        newExpiresAt,
        extendedBy,
      });

      return this.mapRowToGrant(updatedGrant);
    } catch (error) {
      logger.error('Error extending feature grant:', error);
      throw error;
    }
  }

  /**
   * Get a single grant by ID
   */
  async getGrant(grantId: string): Promise<FeatureGrant | null> {
    try {
      const grant = await db('organization_feature_grants')
        .where('id', grantId)
        .first();

      return grant ? this.mapRowToGrant(grant) : null;
    } catch (error) {
      logger.error(`Error getting grant ${grantId}:`, error);
      throw error;
    }
  }

  /**
   * Map database row to FeatureGrant
   */
  private mapRowToGrant(row: FeatureGrantRow): FeatureGrant {
    return {
      id: row.id,
      organizationId: row.organization_id,
      featureName: row.feature_name,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
      grantedBy: row.granted_by,
      revokedAt: row.revoked_at,
      revokedBy: row.revoked_by,
      reason: row.reason,
      createdAt: row.created_at,
    };
  }
}

export const featureGrantService = new FeatureGrantService();
export default featureGrantService;
