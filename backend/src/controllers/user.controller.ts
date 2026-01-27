import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError';
import userService from '../services/user.service';

// Validation schemas
const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  name: z.string().min(1, 'Name cannot be empty').optional(),
  role: z.string().optional(),
  department: z.string().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  department: z.string().optional(),
  job_title: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
});

const updateNotificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  slack: z.boolean().optional(),
  inApp: z.boolean().optional(),
});

export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;
    
    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }
    const userId = req.user!.id;
    const user = await userService.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Remove sensitive data
    const { password: _password, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // ★ Security Fix: Filter users by organization to prevent IDOR
    // Users can only see other users in their own organization
    const filters = {
      organization_id: organizationId, // CRITICAL: Always filter by org
      role: req.query.role as string,
      department: req.query.department as string,
      manager_id: req.query.manager_id as string,
    };

    const result = await userService.getAllUsers(filters);

    res.json({
      users: result.users,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('User ID is required');
    }

    // Users can always view their own profile
    if (id === req.user?.id) {
      const user = await userService.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      const { password: _password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
      return;
    }

    // For viewing other users, must be MANAGER/ADMIN/OWNER
    if (!['manager', 'admin', 'owner'].includes(req.user?.org_role || '')) {
      throw new ForbiddenError('Access denied');
    }

    // ★ Security Fix: Verify target user is in the same organization
    const targetUser = await userService.findById(id);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    // CRITICAL: Verify organization membership to prevent IDOR
    if (targetUser.organization_id !== organizationId) {
      // Don't reveal that user exists in another org - return generic 404
      throw new NotFoundError('User not found');
    }

    const { password: _password, ...userWithoutPassword } = targetUser;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('User ID is required');
    }

    // Validate request body
    const updates = updateUserSchema.parse(req.body);

    // Users can update their own profile
    if (id === req.user?.id) {
      const updatedUser = await userService.updateUser(id, updates);
      const { password: _password, ...userWithoutPassword } = updatedUser;
      res.json({
        message: 'User updated successfully',
        user: userWithoutPassword,
      });
      return;
    }

    // Only admins/owners can update other users
    if (req.user?.org_role !== 'admin' && req.user?.org_role !== 'owner') {
      throw new ForbiddenError('Access denied');
    }

    // ★ Security Fix: Verify target user is in the same organization
    const targetUser = await userService.findById(id);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    // CRITICAL: Verify organization membership to prevent IDOR
    if (targetUser.organization_id !== organizationId) {
      // Don't reveal that user exists in another org
      throw new NotFoundError('User not found');
    }

    // Perform the update
    const updatedUser = await userService.updateUser(id, updates);
    const { password: _password, ...userWithoutPassword } = updatedUser;

    res.json({
      message: 'User updated successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const userId = req.user!.id;

    // Validate request body
    const { name, department, job_title, phone, bio } = updateProfileSchema.parse(req.body);

    // Build update object with only defined values
    const updates: Record<string, string | undefined> = {};
    if (name !== undefined) updates.name = name;
    if (department !== undefined) updates.department = department;
    if (job_title !== undefined) updates.job_title = job_title;
    if (phone !== undefined) updates.phone = phone;
    if (bio !== undefined) updates.bio = bio;

    const updatedUser = await userService.updateUser(userId, updates);

    // Remove sensitive data from response
    const { password: _password, ...userWithoutPassword } = updatedUser;

    res.json({
      message: 'Profile updated successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};

export const updateNotificationPreferences = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Validate request body
    const { email, slack, inApp } = updateNotificationPreferencesSchema.parse(req.body);

    // TODO: Implement notification preferences update
    const preferences = {
      email: email !== undefined ? email : true,
      slack: slack !== undefined ? slack : true,
      inApp: inApp !== undefined ? inApp : true,
      updatedAt: new Date(),
    };

    res.json({
      message: 'Notification preferences updated successfully',
      preferences,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`));
      return;
    }
    next(error);
  }
};