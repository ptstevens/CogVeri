import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middleware/auth';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';
import userService from '../services/user.service';

// Generate JWT token
const generateToken = (user: any) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
  });
};

// Generate refresh token
const generateRefreshToken = (user: any) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT refresh secret is not configured');
  }

  const payload = { id: user.id };

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any,
  });
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    // Find user by email
    const user = await userService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Validate password
    const isValidPassword = await userService.validatePassword(password, user.password);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const userForToken = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = generateToken(userForToken);
    const refreshToken = generateRefreshToken(userForToken);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      refreshToken,
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement token blacklisting if needed
    logger.info(`User ${req.user?.id} logged out`);

    res.json({
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new BadRequestError('Refresh token is required');
    }

    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT refresh secret is not configured');
    }

    const decoded = jwt.verify(refreshToken, secret) as any;

    // Fetch actual user from database
    const user = await userService.findById(decoded.id);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const userForToken = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = generateToken(userForToken);
    const newRefreshToken = generateRefreshToken(userForToken);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      refreshToken: newRefreshToken,
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, department } = req.body;

    if (!email || !password || !name) {
      throw new BadRequestError('Email, password, and name are required');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters long');
    }

    // Create user
    const user = await userService.createUser({
      email,
      password,
      name,
      department,
      role: 'employee', // Default role
    });

    // Generate tokens
    const userForToken = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = generateToken(userForToken);
    const refreshToken = generateRefreshToken(userForToken);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: 'Registration successful',
      token,
      refreshToken,
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const user = await userService.findById(req.user.id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};