import { Request, Response } from 'express';
import retentionService from '../services/retention.service';
import { sendErrorResponse } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * Retention Controller
 * Handles retention policy management and enforcement
 */

export const createRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { name, description, retentionDays, retentionUnit, applyTo, applyRules, exemptionRules, action, autoEnforce, checkIntervalDays } = req.body;

    // Validate required fields
    if (!name || !retentionDays || !retentionUnit || !applyTo || !action) {
      sendErrorResponse(
        res,
        400,
        'name, retentionDays, retentionUnit, applyTo, and action are required'
      );
      return;
    }

    // Validate retentionUnit
    if (!['days', 'weeks', 'months', 'years'].includes(retentionUnit)) {
      sendErrorResponse(res, 400, 'retentionUnit must be one of: days, weeks, months, years');
      return;
    }

    // Validate action
    if (!['delete', 'archive', 'anonymize'].includes(action)) {
      sendErrorResponse(res, 400, 'action must be one of: delete, archive, anonymize');
      return;
    }

    // Validate applyTo
    if (!['all_recordings', 'by_status', 'by_type', 'by_age'].includes(applyTo)) {
      sendErrorResponse(res, 400, 'applyTo must be one of: all_recordings, by_status, by_type, by_age');
      return;
    }

    const policyData = {
      name,
      description,
      retention_days: retentionDays,
      retention_unit: retentionUnit,
      apply_to: applyTo,
      apply_rules: applyRules || null,
      exemption_rules: exemptionRules || null,
      action,
      auto_enforce: autoEnforce || false,
      check_interval_days: checkIntervalDays || 1,
    };

    const policy = await retentionService.createRetentionPolicy(organizationId, policyData, req.user?.id);

    res.json({
      success: true,
      message: 'Retention policy created successfully',
      data: policy,
    });
  } catch (error) {
    logger.error('Error creating retention policy:', error);
    sendErrorResponse(res, 500, 'Failed to create retention policy');
  }
};

export const getRetentionPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { includeInactive } = req.query;

    const policies = await retentionService.getRetentionPolicies(
      organizationId,
      includeInactive === 'true'
    );

    res.json({
      success: true,
      data: policies || [],
    });
  } catch (error) {
    logger.error('Error fetching retention policies:', error);
    sendErrorResponse(res, 500, 'Failed to fetch retention policies');
  }
};

export const getRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { policyId } = req.params;
    if (!policyId) {
      sendErrorResponse(res, 400, 'Policy ID is required');
      return;
    }

    const db = require('../config/database');

    const policy = await db('recording_retention_policies')
      .where('id', policyId)
      .where('organization_id', organizationId)
      .where('is_archived', false)
      .first();

    if (!policy) {
      sendErrorResponse(res, 404, 'Retention policy not found');
      return;
    }

    // Parse JSON fields
    const formattedPolicy = {
      ...policy,
      apply_rules: policy.apply_rules ? JSON.parse(policy.apply_rules) : null,
      exemption_rules: policy.exemption_rules ? JSON.parse(policy.exemption_rules) : null,
    };

    res.json({
      success: true,
      data: formattedPolicy,
    });
  } catch (error) {
    logger.error('Error fetching retention policy:', error);
    sendErrorResponse(res, 500, 'Failed to fetch retention policy');
  }
};

export const updateRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { policyId } = req.params;
    if (!policyId) {
      sendErrorResponse(res, 400, 'Policy ID is required');
      return;
    }

    const { name, description, retentionDays, retentionUnit, applyTo, applyRules, exemptionRules, action, autoEnforce, checkIntervalDays } = req.body;

    const db = require('../config/database');

    // Verify policy exists and belongs to organization
    const policy = await db('recording_retention_policies')
      .where('id', policyId)
      .where('organization_id', organizationId)
      .where('is_archived', false)
      .first();

    if (!policy) {
      sendErrorResponse(res, 404, 'Retention policy not found');
      return;
    }

    // Validate update fields if provided
    if (retentionUnit && !['days', 'weeks', 'months', 'years'].includes(retentionUnit)) {
      sendErrorResponse(res, 400, 'retentionUnit must be one of: days, weeks, months, years');
      return;
    }

    if (action && !['delete', 'archive', 'anonymize'].includes(action)) {
      sendErrorResponse(res, 400, 'action must be one of: delete, archive, anonymize');
      return;
    }

    if (applyTo && !['all_recordings', 'by_status', 'by_type', 'by_age'].includes(applyTo)) {
      sendErrorResponse(res, 400, 'applyTo must be one of: all_recordings, by_status, by_type, by_age');
      return;
    }

    const updateData: any = { updated_at: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (retentionDays !== undefined) updateData.retention_days = retentionDays;
    if (retentionUnit !== undefined) updateData.retention_unit = retentionUnit;
    if (applyTo !== undefined) updateData.apply_to = applyTo;
    if (applyRules !== undefined) updateData.apply_rules = applyRules ? JSON.stringify(applyRules) : null;
    if (exemptionRules !== undefined) updateData.exemption_rules = exemptionRules ? JSON.stringify(exemptionRules) : null;
    if (action !== undefined) updateData.action = action;
    if (autoEnforce !== undefined) updateData.auto_enforce = autoEnforce;
    if (checkIntervalDays !== undefined) updateData.check_interval_days = checkIntervalDays;

    const updatedPolicy = await db('recording_retention_policies')
      .where('id', policyId)
      .update(updateData)
      .returning('*')
      .then((result: any[]) => result[0]);

    // Parse JSON fields
    const formattedPolicy = {
      ...updatedPolicy,
      apply_rules: updatedPolicy.apply_rules ? JSON.parse(updatedPolicy.apply_rules) : null,
      exemption_rules: updatedPolicy.exemption_rules ? JSON.parse(updatedPolicy.exemption_rules) : null,
    };

    res.json({
      success: true,
      message: 'Retention policy updated successfully',
      data: formattedPolicy,
    });
  } catch (error) {
    logger.error('Error updating retention policy:', error);
    sendErrorResponse(res, 500, 'Failed to update retention policy');
  }
};

export const deleteRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { policyId } = req.params;
    if (!policyId) {
      sendErrorResponse(res, 400, 'Policy ID is required');
      return;
    }

    const db = require('../config/database');

    // Verify policy exists and belongs to organization
    const policy = await db('recording_retention_policies')
      .where('id', policyId)
      .where('organization_id', organizationId)
      .where('is_archived', false)
      .first();

    if (!policy) {
      sendErrorResponse(res, 404, 'Retention policy not found');
      return;
    }

    // Check if this is the default policy
    if (policy.is_default) {
      sendErrorResponse(
        res,
        400,
        'Cannot delete the default policy. Set another policy as default first.'
      );
      return;
    }

    // Soft delete by archiving
    await db('recording_retention_policies')
      .where('id', policyId)
      .update({
        is_archived: true,
        archived_at: new Date(),
        updated_at: new Date(),
      });

    res.json({
      success: true,
      message: 'Retention policy deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting retention policy:', error);
    sendErrorResponse(res, 500, 'Failed to delete retention policy');
  }
};

export const setDefaultRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { policyId } = req.params;
    if (!policyId) {
      sendErrorResponse(res, 400, 'Policy ID is required');
      return;
    }

    await retentionService.setDefaultPolicy(organizationId, policyId);

    res.json({
      success: true,
      message: 'Default retention policy updated successfully',
    });
  } catch (error) {
    logger.error('Error setting default retention policy:', error);
    sendErrorResponse(res, 500, 'Failed to set default retention policy');
  }
};

export const enforceRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { policyId } = req.params;
    if (!policyId) {
      sendErrorResponse(res, 400, 'Policy ID is required');
      return;
    }

    const db = require('../config/database');

    // Verify policy exists and belongs to organization
    const policy = await db('recording_retention_policies')
      .where('id', policyId)
      .where('organization_id', organizationId)
      .where('is_archived', false)
      .first();

    if (!policy) {
      sendErrorResponse(res, 404, 'Retention policy not found');
      return;
    }

    // Enforce the specific policy
    const result = await retentionService.enforcePolicy(organizationId, policy);

    res.json({
      success: true,
      message: 'Retention policy enforced successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error enforcing retention policy:', error);
    sendErrorResponse(res, 500, 'Failed to enforce retention policy');
  }
};

export const getPolicyExecutionHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { policyId } = req.params;
    if (!policyId) {
      sendErrorResponse(res, 400, 'Policy ID is required');
      return;
    }

    const { limit = '50' } = req.query;

    const db = require('../config/database');

    // Verify policy exists and belongs to organization
    const policy = await db('recording_retention_policies')
      .where('id', policyId)
      .where('organization_id', organizationId)
      .first();

    if (!policy) {
      sendErrorResponse(res, 404, 'Retention policy not found');
      return;
    }

    const history = await retentionService.getPolicyExecutionHistory(
      organizationId,
      policyId,
      parseInt(limit as string, 10) || 50
    );

    res.json({
      success: true,
      data: history || [],
    });
  } catch (error) {
    logger.error('Error fetching policy execution history:', error);
    sendErrorResponse(res, 500, 'Failed to fetch policy execution history');
  }
};

export const enforceAllRetentionPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    // Enforce all auto-enabled policies for this organization
    const result = await retentionService.enforceRetentionPolicies(organizationId);

    res.json({
      success: true,
      message: 'All retention policies enforced successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error enforcing all retention policies:', error);
    sendErrorResponse(res, 500, 'Failed to enforce all retention policies');
  }
};

export default {
  createRetentionPolicy,
  getRetentionPolicies,
  getRetentionPolicy,
  updateRetentionPolicy,
  deleteRetentionPolicy,
  setDefaultRetentionPolicy,
  enforceRetentionPolicy,
  getPolicyExecutionHistory,
  enforceAllRetentionPolicies,
};
