import { Request, Response, NextFunction } from 'express';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import onboardingService from '../services/onboarding.service';
import { BadRequestError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const signupWithOrgSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(255),
  organizationName: z.string().min(1).max(255),
  organizationSlug: z.string().max(50).regex(/^[a-z0-9-]+$/).optional(),
}).strict();

// Type derived from signupWithOrgSchema for reference: z.infer<typeof signupWithOrgSchema>

const joinViaInvitationSchema = z.object({
  invitationToken: z.string().uuid(),
});

const completeOnboardingSchema = z.object({
  setupCompleted: z.boolean(),
  preferences: z
    .object({
      theme: z.enum(['light', 'dark']).optional(),
      notifications: z.boolean().optional(),
      emailDigest: z.enum(['daily', 'weekly', 'never']).optional(),
    })
    .optional(),
});

export const signupWithOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = signupWithOrgSchema.parse(req.body);

    const result = await onboardingService.signupWithOrganization(validatedData as any);

    logger.info(`New signup with organization: ${result.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Signup successful. Organization created.',
      data: {
        user: result.user,
        organization: result.organization,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: '1h',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

export const joinOrganizationViaInvitation = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { invitationToken } = joinViaInvitationSchema.parse(req.body);

    const result = await onboardingService.joinOrganizationViaInvitation(
      invitationToken,
      req.user.id,
      req.user.email
    );

    logger.info(`User ${req.user.id} joined organization via invitation`);

    res.json({
      success: true,
      message: 'Successfully joined organization',
      data: {
        organization: result.organization,
        membership: result.membership,
        accessToken: result.accessToken,
        expiresIn: '1h',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

export const completeOnboarding = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const validatedData = completeOnboardingSchema.parse(req.body);

    await onboardingService.completeOnboarding({
      userId: req.user.id,
      organizationId: req.user.org_id,
      setupCompleted: validatedData.setupCompleted,
      preferences: validatedData.preferences,
    });

    logger.info(`Onboarding completed for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Onboarding setup completed',
      data: {
        onboardingCompleted: validatedData.setupCompleted,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

export const getOnboardingStatus = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const status = await onboardingService.getOnboardingStatus(req.user.id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};
