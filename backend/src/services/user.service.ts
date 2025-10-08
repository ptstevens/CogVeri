import bcrypt from 'bcrypt';
import { db } from '../config/database';
import { BadRequestError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  department?: string;
  manager_id?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: string;
  department?: string;
  manager_id?: string;
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
  department?: string;
  role?: string;
  is_active?: boolean;
}

class UserService {
  private readonly SALT_ROUNDS = 10;

  async createUser(userData: CreateUserDto): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await db('users')
        .where('email', userData.email)
        .first();

      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, this.SALT_ROUNDS);

      // Create user
      const [user] = await db('users')
        .insert({
          ...userData,
          password: hashedPassword,
          role: userData.role || 'employee',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`User created: ${user.email}`);

      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await db('users')
        .where('email', email)
        .where('is_active', true)
        .first();

      return user || null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const user = await db('users')
        .where('id', id)
        .where('is_active', true)
        .first();

      return user || null;
    } catch (error) {
      logger.error('Error finding user by id:', error);
      throw error;
    }
  }

  async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      logger.error('Error validating password:', error);
      return false;
    }
  }

  async updateUser(id: string, updateData: UpdateUserDto): Promise<User> {
    try {
      const [updatedUser] = await db('users')
        .where('id', id)
        .update({
          ...updateData,
          updated_at: new Date(),
        })
        .returning('*');

      if (!updatedUser) {
        throw new NotFoundError('User not found');
      }

      logger.info(`User updated: ${updatedUser.email}`);
      return updatedUser;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await this.findById(userId);

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Validate old password
      const isValidPassword = await this.validatePassword(oldPassword, user.password);

      if (!isValidPassword) {
        throw new BadRequestError('Invalid current password');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

      // Update password
      await db('users')
        .where('id', userId)
        .update({
          password: hashedPassword,
          updated_at: new Date(),
        });

      logger.info(`Password changed for user: ${user.email}`);
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  async getAllUsers(filters?: { role?: string; department?: string; manager_id?: string }): Promise<User[]> {
    try {
      let query = db('users')
        .where('is_active', true)
        .select('*')
        .orderBy('name', 'asc');

      if (filters?.role) {
        query = query.where('role', filters.role);
      }

      if (filters?.department) {
        query = query.where('department', filters.department);
      }

      if (filters?.manager_id) {
        query = query.where('manager_id', filters.manager_id);
      }

      const users = await query;

      // Remove sensitive information
      return users.map(user => {
        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
    } catch (error) {
      logger.error('Error fetching users:', error);
      throw error;
    }
  }

  async deactivateUser(id: string): Promise<void> {
    try {
      const result = await db('users')
        .where('id', id)
        .update({
          is_active: false,
          updated_at: new Date(),
        });

      if (result === 0) {
        throw new NotFoundError('User not found');
      }

      logger.info(`User deactivated: ${id}`);
    } catch (error) {
      logger.error('Error deactivating user:', error);
      throw error;
    }
  }

}

export default new UserService();