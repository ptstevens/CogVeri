import { db } from '../config/database';
import { BadRequestError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';
// import storageService from './storage.service';

interface RetentionPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  retentionDays: number;
  retentionUnit: 'days' | 'weeks' | 'months' | 'years';
  applyTo: 'all' | 'by_status' | 'by_type' | 'by_age';
  applyRules?: any;
  actionOnExpiry: 'delete' | 'archive' | 'anonymize';
  isActive: boolean;
  isDefault: boolean;
  autoEnforce: boolean;
  priority: number;
}

class RetentionService {
  /**
   * Create a retention policy for organization
   */
  async createRetentionPolicy(
    organizationId: string,
    data: Partial<RetentionPolicy>,
    _createdBy?: string
  ): Promise<RetentionPolicy> {
    try {
      if (!data.name) {
        throw new BadRequestError('Policy name is required');
      }
      if (!data.retentionDays || data.retentionDays <= 0) {
        throw new BadRequestError('Retention period must be greater than 0');
      }

      const existingPolicies = await db('recording_retention_policies')
        .where('organization_id', organizationId)
        .count('* as count');

      const isDefault = Number(existingPolicies[0]?.count) === 0;

      const [policy] = await db('recording_retention_policies')
        .insert({
          organization_id: organizationId,
          name: data.name,
          description: data.description,
          retention_days: data.retentionDays,
          retention_unit: data.retentionUnit || 'days',
          apply_to: data.applyTo || 'all',
          apply_rules: data.applyRules || null,
          action_on_expiry: data.actionOnExpiry || 'delete',
          is_active: data.isActive !== false,
          is_default: isDefault,
          auto_enforce: data.autoEnforce !== false,
          priority: data.priority || 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Retention policy created for organization ${organizationId}: ${policy.name}`);
      return this.formatPolicy(policy);
    } catch (error) {
      logger.error('Error creating retention policy:', error);
      throw error;
    }
  }

  /**
   * Get retention policies for organization
   */
  async getRetentionPolicies(organizationId: string, includeInactive = false): Promise<RetentionPolicy[]> {
    try {
      let query = db('recording_retention_policies')
        .where('organization_id', organizationId)
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'desc');

      if (!includeInactive) {
        query = query.where('is_active', true);
      }

      const policies = await query;
      return policies.map(p => this.formatPolicy(p));
    } catch (error) {
      logger.error('Error getting retention policies:', error);
      throw error;
    }
  }

  /**
   * Get default retention policy for organization
   */
  async getDefaultRetentionPolicy(organizationId: string): Promise<RetentionPolicy | null> {
    try {
      const policy = await db('recording_retention_policies')
        .where('organization_id', organizationId)
        .where('is_default', true)
        .where('is_active', true)
        .first();

      return policy ? this.formatPolicy(policy) : null;
    } catch (error) {
      logger.error('Error getting default retention policy:', error);
      return null;
    }
  }

  /**
   * Update retention policy
   */
  async updateRetentionPolicy(
    organizationId: string,
    policyId: string,
    data: Partial<RetentionPolicy>
  ): Promise<RetentionPolicy> {
    try {
      const policy = await db('recording_retention_policies')
        .where('id', policyId)
        .where('organization_id', organizationId)
        .first();

      if (!policy) {
        throw new NotFoundError('Retention policy not found');
      }

      const [updated] = await db('recording_retention_policies')
        .where('id', policyId)
        .update({
          name: data.name || policy.name,
          description: data.description !== undefined ? data.description : policy.description,
          retention_days: data.retentionDays || policy.retention_days,
          retention_unit: data.retentionUnit || policy.retention_unit,
          apply_to: data.applyTo || policy.apply_to,
          apply_rules: data.applyRules !== undefined ? data.applyRules : policy.apply_rules,
          action_on_expiry: data.actionOnExpiry || policy.action_on_expiry,
          is_active: data.isActive !== undefined ? data.isActive : policy.is_active,
          priority: data.priority !== undefined ? data.priority : policy.priority,
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Retention policy updated: ${policyId}`);
      return this.formatPolicy(updated);
    } catch (error) {
      logger.error('Error updating retention policy:', error);
      throw error;
    }
  }

  /**
   * Delete retention policy
   */
  async deleteRetentionPolicy(organizationId: string, policyId: string): Promise<void> {
    try {
      const policy = await db('recording_retention_policies')
        .where('id', policyId)
        .where('organization_id', organizationId)
        .first();

      if (!policy) {
        throw new NotFoundError('Retention policy not found');
      }

      if (policy.is_default) {
        throw new BadRequestError('Cannot delete the default retention policy');
      }

      await db('recording_retention_policies')
        .where('id', policyId)
        .update({
          is_active: false,
          updated_at: new Date(),
        });

      logger.info(`Retention policy archived: ${policyId}`);
    } catch (error) {
      logger.error('Error deleting retention policy:', error);
      throw error;
    }
  }

  /**
   * Set a policy as default for the organization
   */
  async setDefaultPolicy(organizationId: string, policyId: string): Promise<void> {
    try {
      const policy = await db('recording_retention_policies')
        .where('id', policyId)
        .where('organization_id', organizationId)
        .first();

      if (!policy) {
        throw new NotFoundError('Retention policy not found');
      }

      await db('recording_retention_policies')
        .where('organization_id', organizationId)
        .where('is_default', true)
        .update({ is_default: false });

      await db('recording_retention_policies')
        .where('id', policyId)
        .update({ is_default: true });

      logger.info(`Default retention policy set: ${policyId}`);
    } catch (error) {
      logger.error('Error setting default policy:', error);
      throw error;
    }
  }

  /**
   * Check for expired recordings and execute retention policy
   */
  async enforceRetentionPolicies(organizationId?: string): Promise<{ processed: number; affected: number; failed: number }> {
    try {
      const organizationIds = organizationId
        ? [organizationId]
        : (await db('organizations').select('id')).map(o => o.id);

      let totalProcessed = 0;
      let totalAffected = 0;
      let totalFailed = 0;

      for (const orgId of organizationIds) {
        const policies = await db('recording_retention_policies')
          .where('organization_id', orgId)
          .where('is_active', true)
          .where('auto_enforce', true)
          .orderBy('priority', 'desc');

        for (const policy of policies) {
          const result = await this.enforcePolicy(orgId, policy);
          totalProcessed += result.processed;
          totalAffected += result.affected;
          totalFailed += result.failed;
        }
      }

      logger.info(
        `Retention policies enforced - Processed: ${totalProcessed}, Affected: ${totalAffected}, Failed: ${totalFailed}`
      );

      return {
        processed: totalProcessed,
        affected: totalAffected,
        failed: totalFailed,
      };
    } catch (error) {
      logger.error('Error enforcing retention policies:', error);
      throw error;
    }
  }

  /**
   * Enforce a specific retention policy
   */
  async enforcePolicy(organizationId: string, policy: any): Promise<{
    processed: number;
    affected: number;
    failed: number;
  }> {
    try {
      const batchId = `${organizationId}-${policy.id}-${Date.now()}`;

      const [_executionLog] = await db('retention_execution_logs')
        .insert({
          organization_id: organizationId,
          policy_id: policy.id,
          action: policy.action_on_expiry,
          status: 'running',
          batch_id: batchId,
          started_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      // TODO: Implement proper retention policy enforcement with Knex queries
      // This is a stub implementation for now
      return {
        processed: 0,
        affected: 0,
        failed: 0,
      };
    } catch (error) {
      logger.error('Error enforcing retention policy:', error);
      throw error;
    }
  }

  /**
   * Calculate cutoff date based on policy
   * Note: Currently unused but kept for future retention policy enforcement
   */
  // @ts-expect-error Kept for future use when retention enforcement is implemented
  private calculateCutoffDate(policy: any): Date {
    const now = new Date();
    const days = this.convertToDays(policy.retention_days, policy.retention_unit);

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);

    return cutoff;
  }

  /**
   * Convert retention period to days
   */
  private convertToDays(value: number, unit: string): number {
    switch (unit) {
      case 'weeks':
        return value * 7;
      case 'months':
        return value * 30;
      case 'years':
        return value * 365;
      case 'days':
      default:
        return value;
    }
  }

  /**
   * Format policy object for response
   */
  private formatPolicy(policy: any): RetentionPolicy {
    return {
      id: policy.id,
      organizationId: policy.organization_id,
      name: policy.name,
      description: policy.description,
      retentionDays: policy.retention_days,
      retentionUnit: policy.retention_unit,
      applyTo: policy.apply_to,
      applyRules: policy.apply_rules,
      actionOnExpiry: policy.action_on_expiry,
      isActive: policy.is_active,
      isDefault: policy.is_default,
      autoEnforce: policy.auto_enforce,
      priority: policy.priority,
    };
  }

  /**
   * Get execution history for a policy
   */
  async getPolicyExecutionHistory(
    organizationId: string,
    policyId: string,
    limit = 50
  ): Promise<any[]> {
    try {
      return await db('retention_execution_logs')
        .where('organization_id', organizationId)
        .where('policy_id', policyId)
        .orderBy('created_at', 'desc')
        .limit(limit);
    } catch (error) {
      logger.error('Error getting execution history:', error);
      throw error;
    }
  }
}

export default new RetentionService();
