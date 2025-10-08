import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import magicLinkService from '../services/magicLink.service';
import { BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const createMagicLinkSchema = z.object({
  taskId: z.string().uuid(),
  email: z.string().email(),
  expiresInDays: z.number().int().min(1).max(365),
  maxUses: z.number().int().positive().optional(),
});

const claimTaskSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
});

class MagicLinkController {
  /**
   * Create a magic link for a task
   */
  async createMagicLink(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const validatedData = createMagicLinkSchema.parse(req.body) as {
        taskId: string;
        email: string;
        expiresInDays: number;
        maxUses?: number;
      };
      const result = await magicLinkService.createMagicLink(validatedData);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new BadRequestError(`Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`)
        );
      }
      next(error);
    }
  }

  /**
   * Validate a token (public endpoint)
   */
  async validateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await magicLinkService.validateToken(token, ipAddress, userAgent);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get task details by token (public endpoint)
   */
  async getTaskByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const result = await magicLinkService.getTaskByToken(token);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Claim a task (public endpoint - sets name and email)
   */
  async claimTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const validatedData = claimTaskSchema.parse(req.body) as {
        firstName: string;
        lastName: string;
        email: string;
      };

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await magicLinkService.claimTask(
        {
          token,
          ...validatedData,
        },
        ipAddress,
        userAgent
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new BadRequestError(`Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`)
        );
      }
      next(error);
    }
  }

  /**
   * Revoke a magic link
   */
  async revokeToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const userId = req.user!.id;

      await magicLinkService.revokeToken(taskId, userId);

      res.json({
        success: true,
        message: 'Magic link revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all external contributors
   */
  async getExternalContributors(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { search, limit } = req.query;
      const contributors = await magicLinkService.getExternalContributors(
        search as string,
        limit ? parseInt(limit as string) : 50
      );

      res.json({
        success: true,
        data: contributors,
        total: contributors.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get contributor analytics
   */
  async getContributorAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { contributorId } = req.params;
      const analytics = await magicLinkService.getContributorAnalytics(contributorId);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new MagicLinkController();
