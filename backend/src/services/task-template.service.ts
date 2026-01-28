import { db } from '../config/database';
import { logger } from '../utils/logger';
import { evidenceExtractionService } from './evidence-extraction.service';

export interface CreateTemplateInput {
  title: string;
  description?: string;
  category?: string;
  iconEmoji?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  instructions?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  requiredFeatures?: any;
  evaluationCriteria?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  metadata?: any;
  organizationId?: string; // null = system-wide default
  createdBy: string;
  isSystemDefault?: boolean;
  isActive?: boolean; // false = draft template, needs review before live
  tempVideoId?: string; // If provided, link evidence from rubric generation
}

export interface UpdateTemplateInput {
  title?: string;
  description?: string;
  category?: string;
  iconEmoji?: string;
  type?: 'recording' | 'live_demo' | 'hybrid';
  instructions?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  requiredFeatures?: any;
  evaluationCriteria?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  metadata?: any;
  isActive?: boolean;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  category?: string;
  iconEmoji: string;
  organizationId?: string;
  type: 'recording' | 'live_demo' | 'hybrid';
  instructions?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  requiredFeatures?: any;
  evaluationCriteria?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  metadata?: any;
  createdBy: string;
  isActive: boolean;
  isSystemDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class TaskTemplateService {
  /**
   * Get system-wide default templates
   */
  async getSystemDefaults(): Promise<TaskTemplate[]> {
    try {
      const templates = await db('task_templates')
        .where('is_system_default', true)
        .where('is_active', true)
        .orderBy('title', 'asc');

      return templates.map(this.mapTemplate);
    } catch (error) {
      logger.error('Error getting system default templates:', error);
      throw error;
    }
  }

  /**
   * Get templates for a specific organization
   * Returns only org-owned templates (system defaults are copied on org creation)
   */
  async getOrganizationTemplates(organizationId: string, includeDrafts: boolean = false): Promise<TaskTemplate[]> {
    try {
      // Return only org-specific templates (not system defaults)
      // System defaults are copied to each org on creation, so orgs own their copies
      let query = db('task_templates')
        .where('organization_id', organizationId)
        .orderBy('is_active', 'desc') // Active templates first
        .orderBy('category', 'asc')
        .orderBy('title', 'asc');

      // Filter to active only unless includeDrafts is true
      if (!includeDrafts) {
        query = query.where('is_active', true);
      }

      const templates = await query;

      return templates.map(this.mapTemplate);
    } catch (error) {
      logger.error('Error getting organization templates:', error);
      throw error;
    }
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(templateId: string): Promise<TaskTemplate | null> {
    try {
      const template = await db('task_templates')
        .where('id', templateId)
        .first();

      return template ? this.mapTemplate(template) : null;
    } catch (error) {
      logger.error('Error getting template:', error);
      throw error;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(input: CreateTemplateInput): Promise<TaskTemplate> {
    try {
      logger.info(`📋 Creating new task template: ${input.title}`);

      // PostgreSQL requires .returning('id') to get the inserted ID
      const [result] = await db('task_templates').insert({
        title: input.title,
        description: input.description || '',
        category: input.category || 'General',
        icon_emoji: input.iconEmoji || '📝',
        organization_id: input.organizationId || null,
        type: input.type,
        instructions: input.instructions || '',
        min_duration_seconds: input.minDurationSeconds || null,
        max_duration_seconds: input.maxDurationSeconds || null,
        required_features: input.requiredFeatures || null,
        evaluation_criteria: input.evaluationCriteria || null,
        priority: input.priority || 'medium',
        tags: input.tags || [],
        metadata: input.metadata || null,
        created_by: input.createdBy,
        is_active: input.isActive ?? true, // Default to active, but allow draft templates
        is_system_default: input.isSystemDefault || false,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      const templateId = result.id;
      logger.info(`✅ Template created: ${templateId}`);

      // Link evidence from rubric generation if tempVideoId is provided
      if (input.tempVideoId) {
        try {
          const linkedCount = await evidenceExtractionService.linkEvidenceToTemplate(
            input.tempVideoId,
            templateId.toString()
          );
          logger.info(`🔗 Linked ${linkedCount} evidence records to template`, {
            templateId,
            tempVideoId: input.tempVideoId,
          });
        } catch (evidenceError) {
          // Don't fail template creation if evidence linking fails
          logger.warn('Failed to link evidence to template', {
            templateId,
            tempVideoId: input.tempVideoId,
            error: evidenceError,
          });
        }
      }

      const template = await this.getTemplate(templateId.toString());
      if (!template) {
        throw new Error('Failed to retrieve created template');
      }

      return template;
    } catch (error) {
      logger.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    templateId: string,
    input: UpdateTemplateInput
  ): Promise<TaskTemplate> {
    try {
      logger.info(`📝 Updating template: ${templateId}`);

      const updateData: any = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.iconEmoji !== undefined) updateData.icon_emoji = input.iconEmoji;
      if (input.type !== undefined) updateData.type = input.type;
      if (input.instructions !== undefined) updateData.instructions = input.instructions;
      if (input.minDurationSeconds !== undefined)
        updateData.min_duration_seconds = input.minDurationSeconds;
      if (input.maxDurationSeconds !== undefined)
        updateData.max_duration_seconds = input.maxDurationSeconds;
      if (input.requiredFeatures !== undefined)
        updateData.required_features = input.requiredFeatures;
      if (input.evaluationCriteria !== undefined)
        updateData.evaluation_criteria = input.evaluationCriteria;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.tags !== undefined) updateData.tags = input.tags;
      if (input.metadata !== undefined) updateData.metadata = input.metadata;
      if (input.isActive !== undefined) updateData.is_active = input.isActive;

      updateData.updated_at = new Date();

      await db('task_templates')
        .where('id', templateId)
        .update(updateData);

      logger.info(`✅ Template updated: ${templateId}`);

      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error('Failed to retrieve updated template');
      }

      return template;
    } catch (error) {
      logger.error('Error updating template:', error);
      throw error;
    }
  }

  /**
   * Delete (soft delete) a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    try {
      logger.info(`🗑️ Deleting template: ${templateId}`);

      // Check if this is a system default - prevent deletion of protected defaults
      const template = await this.getTemplate(templateId);
      if (template?.isSystemDefault) {
        throw new Error('Cannot delete system default templates');
      }

      await db('task_templates')
        .where('id', templateId)
        .update({
          is_active: false,
          updated_at: new Date()
        });

      logger.info(`✅ Template deleted: ${templateId}`);
    } catch (error) {
      logger.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Provision default templates for a new organization
   * Creates org-owned copies of all system default templates
   * This is called when an organization is created
   */
  async provisionDefaultTemplates(
    organizationId: string,
    createdByUserId: string
  ): Promise<TaskTemplate[]> {
    try {
      logger.info(`📋 Provisioning default templates for organization: ${organizationId}`);

      // Get system-wide default templates
      const systemDefaults = await this.getSystemDefaults();
      const provisionedTemplates: TaskTemplate[] = [];

      // Create org-owned copy of each system default
      // Use individual try-catch to ensure one failure doesn't stop all templates
      for (const defaultTemplate of systemDefaults) {
        try {
          const orgTemplate = await this.createTemplate({
            title: defaultTemplate.title,
            description: defaultTemplate.description,
            category: defaultTemplate.category,
            iconEmoji: defaultTemplate.iconEmoji,
            type: defaultTemplate.type,
            instructions: defaultTemplate.instructions,
            minDurationSeconds: defaultTemplate.minDurationSeconds,
            maxDurationSeconds: defaultTemplate.maxDurationSeconds,
            requiredFeatures: defaultTemplate.requiredFeatures,
            evaluationCriteria: defaultTemplate.evaluationCriteria,
            priority: defaultTemplate.priority,
            tags: defaultTemplate.tags,
            metadata: {
              ...defaultTemplate.metadata,
              copiedFromSystemDefault: defaultTemplate.id,
            },
            organizationId: organizationId,
            createdBy: createdByUserId,
            isSystemDefault: false, // Org copy is NOT a system default - it's editable
          });

          provisionedTemplates.push(orgTemplate);
        } catch (templateError) {
          // Log error but continue with remaining templates
          logger.error(`Failed to provision template "${defaultTemplate.title}" for org ${organizationId}:`, templateError);
        }
      }

      logger.info(`✅ Provisioned ${provisionedTemplates.length} templates for organization ${organizationId}`);

      return provisionedTemplates;
    } catch (error) {
      logger.error('Error provisioning default templates:', error);
      throw error;
    }
  }

  /**
   * Get list of system defaults that an organization doesn't have (for restore functionality)
   * Returns system defaults that the org has either deleted or never received
   */
  async getRestorableDefaults(organizationId: string): Promise<TaskTemplate[]> {
    try {
      logger.info(`🔍 Getting restorable defaults for org: ${organizationId}`);

      // Get IDs of system defaults the org already has (active copies)
      const existingCopies = await db('task_templates')
        .select(db.raw("metadata->>'copiedFromSystemDefault' as source_id"))
        .where('organization_id', organizationId)
        .where('is_active', true)
        .whereRaw("metadata->>'copiedFromSystemDefault' IS NOT NULL");

      const existingSourceIds = existingCopies
        .map((c: any) => c.source_id)
        .filter(Boolean);

      // Get system defaults not in that list
      let query = db('task_templates')
        .where('is_system_default', true)
        .where('is_active', true);

      if (existingSourceIds.length > 0) {
        query = query.whereNotIn('id', existingSourceIds);
      }

      const templates = await query.orderBy('title', 'asc');

      logger.info(`Found ${templates.length} restorable defaults for org ${organizationId}`);
      return templates.map((row: any) => this.mapTemplate(row));
    } catch (error) {
      logger.error('Error getting restorable defaults:', error);
      throw error;
    }
  }

  /**
   * Restore a deleted system default copy for an organization
   * Creates a fresh copy of the specified system default template
   */
  async restoreSystemDefault(
    systemDefaultId: string,
    organizationId: string,
    userId: string
  ): Promise<TaskTemplate> {
    try {
      logger.info(`🔄 Restoring system default ${systemDefaultId} for org ${organizationId}`);

      // 1. Get the system default template
      const systemDefault = await db('task_templates')
        .where('id', systemDefaultId)
        .where('is_system_default', true)
        .where('is_active', true)
        .first();

      if (!systemDefault) {
        throw new Error('System default template not found');
      }

      // 2. Check if org already has an active copy
      const existingCopy = await db('task_templates')
        .where('organization_id', organizationId)
        .where('is_active', true)
        .whereRaw("metadata->>'copiedFromSystemDefault' = ?", [systemDefaultId])
        .first();

      if (existingCopy) {
        throw new Error('Template already exists in your organization');
      }

      // 3. Create fresh copy using the standard createTemplate method
      const template = await this.createTemplate({
        title: systemDefault.title,
        description: systemDefault.description,
        category: systemDefault.category,
        iconEmoji: systemDefault.icon_emoji,
        type: systemDefault.type,
        instructions: systemDefault.instructions,
        minDurationSeconds: systemDefault.min_duration_seconds,
        maxDurationSeconds: systemDefault.max_duration_seconds,
        requiredFeatures: systemDefault.required_features,
        evaluationCriteria: systemDefault.evaluation_criteria,
        priority: systemDefault.priority,
        tags: systemDefault.tags,
        metadata: {
          ...systemDefault.metadata,
          copiedFromSystemDefault: systemDefaultId,
          restoredAt: new Date().toISOString(),
        },
        organizationId,
        createdBy: userId,
        isSystemDefault: false,
      });

      logger.info(`✅ Restored system default: ${template.id}`);
      return template;
    } catch (error) {
      logger.error('Error restoring system default:', error);
      throw error;
    }
  }

  /**
   * Copy all system default templates to a new organization
   * Called when an organization is first created
   */
  async copyAllSystemDefaultsToOrganization(
    organizationId: string,
    userId: string
  ): Promise<TaskTemplate[]> {
    try {
      logger.info(`📋 Copying all system defaults to org ${organizationId}`);

      // Get all active system defaults
      const systemDefaults = await db('task_templates')
        .where('is_system_default', true)
        .where('is_active', true)
        .whereNull('organization_id');

      if (systemDefaults.length === 0) {
        logger.info('No system defaults to copy');
        return [];
      }

      const copiedTemplates: TaskTemplate[] = [];

      for (const systemDefault of systemDefaults) {
        try {
          const template = await this.createTemplate({
            title: systemDefault.title,
            description: systemDefault.description,
            category: systemDefault.category,
            iconEmoji: systemDefault.icon_emoji,
            type: systemDefault.type,
            instructions: systemDefault.instructions,
            minDurationSeconds: systemDefault.min_duration_seconds,
            maxDurationSeconds: systemDefault.max_duration_seconds,
            requiredFeatures: systemDefault.required_features,
            evaluationCriteria: systemDefault.evaluation_criteria,
            priority: systemDefault.priority,
            tags: systemDefault.tags,
            metadata: {
              ...systemDefault.metadata,
              copiedFromSystemDefault: systemDefault.id,
              copiedAt: new Date().toISOString(),
            },
            organizationId,
            createdBy: userId,
            isSystemDefault: false,
          });
          copiedTemplates.push(template);
        } catch (err) {
          logger.error(`Failed to copy template ${systemDefault.id}:`, err);
          // Continue with other templates
        }
      }

      logger.info(`✅ Copied ${copiedTemplates.length}/${systemDefaults.length} system defaults to org ${organizationId}`);
      return copiedTemplates;
    } catch (error) {
      logger.error('Error copying system defaults:', error);
      throw error;
    }
  }

  /**
   * Helper method to map database row to template object
   */
  private mapTemplate(row: any): TaskTemplate {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      iconEmoji: row.icon_emoji,
      organizationId: row.organization_id,
      type: row.type,
      instructions: row.instructions,
      minDurationSeconds: row.min_duration_seconds,
      maxDurationSeconds: row.max_duration_seconds,
      requiredFeatures: row.required_features,
      evaluationCriteria: row.evaluation_criteria,
      priority: row.priority,
      tags: row.tags,
      metadata: row.metadata,
      createdBy: row.created_by,
      isActive: row.is_active,
      isSystemDefault: row.is_system_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export default new TaskTemplateService();
