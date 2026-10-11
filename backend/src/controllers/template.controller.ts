import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import taskTemplateService from '../services/task-template.service';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';

class TemplateController {
  // Get system-wide default templates
  async getSystemDefaults(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const templates = await taskTemplateService.getSystemDefaults();

      res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get templates for the current organization (includes system defaults + org-specific)
  async getOrganizationTemplates(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const organizationId = (req as any).user?.org_id;
      const includeDrafts = req.query.includeDrafts === 'true';

      // Handle users without an organization gracefully
      if (!organizationId || organizationId === 'default-org' || organizationId === '') {
        res.json({
          success: true,
          data: [],
          count: 0,
          message:
            'No organization associated with this account. Please create or join an organization first.',
        });
        return;
      }

      const templates = await taskTemplateService.getOrganizationTemplates(
        organizationId,
        includeDrafts
      );

      res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get a single template by ID
  async getTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const template = await taskTemplateService.getTemplate(id!);

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }

  // Create a new template
  async createTemplate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const organizationId = (req as any).user?.org_id;

      if (!organizationId) {
        throw new BadRequestError('Organization ID is required');
      }

      // Validate required fields
      const body = req.body as Record<string, unknown>;
      const { title, type, tempVideoId } = body as {
        title?: string;
        type?: string;
        tempVideoId?: string;
      };
      if (!title || !type) {
        throw new BadRequestError('Title and type are required');
      }

      logger.info('Creating template:', { userId, organizationId, body });

      const template = await taskTemplateService.createTemplate({
        ...(body as object),
        title: title,
        type: type as 'recording' | 'live_demo' | 'hybrid',
        organizationId,
        createdBy: userId,
        isSystemDefault: false, // Organization-specific templates are not system defaults
        tempVideoId, // Link evidence from rubric generation if provided
      });

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update a template
  async updateTemplate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const organizationId = (req as any).user?.org_id;
      const { id } = req.params;

      if (!organizationId) {
        throw new BadRequestError('Organization ID is required');
      }

      // Check if template exists and belongs to organization or is a system default
      const template = await taskTemplateService.getTemplate(id!);
      if (!template) {
        throw new NotFoundError('Template not found');
      }

      // Prevent updates to system default templates
      if (template.isSystemDefault) {
        throw new ForbiddenError('Cannot modify system default templates');
      }

      // Verify ownership - template must belong to user's organization
      if (template.organizationId && template.organizationId !== organizationId) {
        throw new ForbiddenError('You do not have permission to update this template');
      }

      logger.info('Updating template:', { id, userId, organizationId });

      const updatedTemplate = await taskTemplateService.updateTemplate(
        id!,
        req.body as Record<string, unknown>
      );

      res.json({
        success: true,
        data: updatedTemplate,
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete a template
  async deleteTemplate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const organizationId = (req as any).user?.org_id;
      const { id } = req.params;

      if (!organizationId) {
        throw new BadRequestError('Organization ID is required');
      }

      // Check if template exists
      const template = await taskTemplateService.getTemplate(id!);
      if (!template) {
        throw new NotFoundError('Template not found');
      }

      // Prevent deletion of system default templates
      if (template.isSystemDefault) {
        throw new ForbiddenError('Cannot delete system default templates');
      }

      // Verify ownership - template must belong to user's organization
      if (template.organizationId && template.organizationId !== organizationId) {
        throw new ForbiddenError('You do not have permission to delete this template');
      }

      logger.info('Deleting template:', { id, userId, organizationId });

      await taskTemplateService.deleteTemplate(id!);

      res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get system defaults that can be restored (ones the org doesn't have)
  async getRestorableDefaults(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const organizationId = (req as any).user?.org_id;

      // Handle users without an organization gracefully
      if (!organizationId || organizationId === 'default-org' || organizationId === '') {
        res.json({
          success: true,
          data: [],
          count: 0,
        });
        return;
      }

      const templates = await taskTemplateService.getRestorableDefaults(organizationId);

      res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // Restore a system default template for the organization
  async restoreDefault(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const organizationId = (req as any).user?.org_id;
      const { systemDefaultId } = req.body as { systemDefaultId?: string };

      if (!organizationId || organizationId === 'default-org' || organizationId === '') {
        throw new BadRequestError('Organization ID is required');
      }

      if (!systemDefaultId) {
        throw new BadRequestError('System default template ID is required');
      }

      logger.info('Restoring default template:', { systemDefaultId, userId, organizationId });

      const template = await taskTemplateService.restoreSystemDefault(
        systemDefaultId,
        organizationId,
        userId
      );

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TemplateController();
