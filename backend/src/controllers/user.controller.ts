import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError';
import userService from '../services/user.service';

export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const user = await userService.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Remove sensitive data
    const { password, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // For now, allow all authenticated users to list users (for task assignment)
    // Later we can add more granular permissions
    const filters = {
      role: req.query.role as string,
      department: req.query.department as string,
      manager_id: req.query.manager_id as string,
    };

    const users = await userService.getAllUsers(filters);

    res.json({
      users,
      total: users.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Users can view their own profile, managers can view anyone
    if (id !== req.user?.id && !['manager', 'admin'].includes(req.user?.role || '')) {
      throw new ForbiddenError('Access denied');
    }

    // TODO: Implement database query
    const user = {
      id,
      email: 'user@example.com',
      name: 'John Doe',
      role: 'employee',
      notificationPreferences: {
        email: true,
        slack: true,
        inApp: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Only admins can update other users
    if (id !== req.user?.id && req.user?.role !== 'admin') {
      throw new ForbiddenError('Access denied');
    }

    // TODO: Implement database update
    const user = {
      id,
      ...updates,
      updatedAt: new Date(),
    };

    res.json({
      message: 'User updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { name, department, job_title, phone, bio } = req.body;

    const updatedUser = await userService.updateUser(userId, {
      name,
      department,
      ...(job_title && { job_title }),
      ...(phone && { phone }),
      ...(bio && { bio }),
    });

    // Remove sensitive data from response
    const { password, ...userWithoutPassword } = updatedUser;

    res.json({
      message: 'Profile updated successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const updateNotificationPreferences = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, slack, inApp } = req.body;

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
    next(error);
  }
};