import bcrypt from 'bcrypt';
import { Knex } from 'knex';
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
  organization_id?: string;
  org_role?: string;
  org_status?: string;
  is_active: boolean;
  is_system_admin?: boolean;
  password_updated_at?: Date; // Track when password was last hashed
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

/**
 * Password hashing configuration
 *
 * OWASP recommends bcrypt with cost factor 10-12 (2023 guidance).
 * We use 12 which provides ~300ms hashing time on modern hardware.
 * This can be increased over time as hardware improves.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
const BCRYPT_COST_FACTOR = 12;

/**
 * Minimum cost factor we consider "current" - passwords hashed with
 * lower cost factors will be rehashed on successful login.
 */
const MIN_ACCEPTABLE_COST_FACTOR = 11;

/**
 * Maximum number of users to return in a single query (Fix #7)
 */
const MAX_USERS_PER_QUERY = 500;

class UserService {
  /**
   * Creates a new user with a securely hashed password.
   * The password is hashed using bcrypt with the current cost factor.
   * @param userData - The user data including email, password, name, and optional role/department
   * @param trx - Optional Knex transaction for atomic operations
   * @returns The created user object with password field excluded
   * @throws {BadRequestError} If a user with the same email already exists
   */
  async createUser(userData: CreateUserDto, trx?: Knex.Transaction): Promise<User> {
    try {
      const queryBuilder = trx || db;

      // Check if user already exists
      const existingUser = await queryBuilder('users')
        .where('email', userData.email.toLowerCase().trim())
        .first();

      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      // Hash password with current cost factor
      const hashedPassword = await bcrypt.hash(userData.password, BCRYPT_COST_FACTOR);

      // Create user
      const [user] = await queryBuilder('users')
        .insert({
          ...userData,
          email: userData.email.toLowerCase().trim(),
          password: hashedPassword,
          role: userData.role || 'employee',
          is_active: true,
          password_updated_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`User created: ${user.email}`);

      // Remove password from response
      const { password: _password, ...userWithoutPassword } = user;
      return userWithoutPassword as User;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Finds an active user by their email address.
   * @param email - The email address to search for (case-insensitive, trimmed)
   * @returns The user object if found and active, or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await db('users')
        .where('email', email.toLowerCase().trim())
        .where('is_active', true)
        .first();

      return user || null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Finds an active user by their unique identifier.
   * @param id - The UUID of the user to find
   * @returns The user object if found and active, or null if not found
   */
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

  /**
   * Validate a password and optionally rehash if using old cost factor.
   *
   * This implements "opportunistic rehashing" - when a user logs in
   * with a password hashed using an older (weaker) cost factor,
   * we rehash it with the current stronger settings.
   *
   * @param plainPassword - The password to validate
   * @param hashedPassword - The stored hash to compare against
   * @param userId - Optional user ID for rehashing
   * @returns Object with isValid flag and needsRehash indicator
   */
  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
    userId?: string
  ): Promise<{ isValid: boolean; needsRehash: boolean }> {
    try {
      const isValid = await bcrypt.compare(plainPassword, hashedPassword);

      if (!isValid) {
        return { isValid: false, needsRehash: false };
      }

      // Check if password needs rehashing
      // bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost factor
      const needsRehash = this.passwordNeedsRehash(hashedPassword);

      // Opportunistically rehash if needed and userId is provided
      if (needsRehash && userId) {
        this.rehashPassword(userId, plainPassword).catch(err => {
          logger.error('Failed to rehash password:', err);
        });
      }

      return { isValid: true, needsRehash };
    } catch (error) {
      logger.error('Error validating password:', error);
      return { isValid: false, needsRehash: false };
    }
  }

  /**
   * Check if a password hash was created with an old cost factor
   */
  private passwordNeedsRehash(hashedPassword: string): boolean {
    try {
      // bcrypt hash format: $2a$XX$... where XX is the cost factor
      const costMatch = hashedPassword.match(/^\$2[aby]?\$(\d{2})\$/);
      if (!costMatch || !costMatch[1]) {
        return true; // Unknown format, should rehash
      }

      const currentCost = parseInt(costMatch[1], 10);
      return currentCost < MIN_ACCEPTABLE_COST_FACTOR;
    } catch {
      return false;
    }
  }

  /**
   * Rehash a user's password with the current cost factor
   * This runs asynchronously to avoid slowing down login
   */
  private async rehashPassword(userId: string, plainPassword: string): Promise<void> {
    try {
      const newHash = await bcrypt.hash(plainPassword, BCRYPT_COST_FACTOR);

      await db('users')
        .where('id', userId)
        .update({
          password: newHash,
          password_updated_at: new Date(),
          updated_at: new Date(),
        });

      logger.info(`Password rehashed for user ${userId} with cost factor ${BCRYPT_COST_FACTOR}`);
    } catch (error) {
      logger.error('Error rehashing password:', error);
      // Don't throw - this is a background operation
    }
  }

  /**
   * Updates an existing user's profile information.
   * @param id - The UUID of the user to update
   * @param updateData - The fields to update (email, name, department, role, is_active)
   * @returns The updated user object with password field excluded
   * @throws {NotFoundError} If the user with the given ID does not exist
   */
  async updateUser(id: string, updateData: UpdateUserDto): Promise<User> {
    try {
      // Normalize email if being updated
      if (updateData.email) {
        updateData.email = updateData.email.toLowerCase().trim();
      }

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

      // Remove sensitive fields from response
      const { password: _password, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword as User;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Changes a user's password after validating the current password.
   * The new password is hashed with the current bcrypt cost factor.
   * @param userId - The UUID of the user changing their password
   * @param oldPassword - The user's current password for verification
   * @param newPassword - The new password to set
   * @throws {NotFoundError} If the user with the given ID does not exist
   * @throws {BadRequestError} If the current password is invalid
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await db('users').where('id', userId).first();

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Validate old password (don't auto-rehash during explicit password change)
      const { isValid } = await this.validatePassword(oldPassword, user.password);

      if (!isValid) {
        throw new BadRequestError('Invalid current password');
      }

      // Hash new password with current cost factor
      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);

      // Update password
      await db('users')
        .where('id', userId)
        .update({
          password: hashedPassword,
          password_updated_at: new Date(),
          updated_at: new Date(),
        });

      logger.info(`Password changed for user: ${user.email}`);
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Retrieves a paginated list of active users with optional filtering.
   * Results are capped at MAX_USERS_PER_QUERY (500) for performance.
   * @param filters - Optional filters for organization_id, role, department, or manager_id
   * @param options - Pagination options with limit (default 50, max 500) and offset
   * @returns An object containing the array of users (without passwords) and total count
   */
  async getAllUsers(
    filters?: {
      organization_id?: string;
      role?: string;
      department?: string;
      manager_id?: string;
    },
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ users: Omit<User, 'password'>[]; total: number }> {
    try {
      // Enforce pagination limits (Fix #7)
      const limit = Math.min(options?.limit || 50, MAX_USERS_PER_QUERY);
      const offset = options?.offset || 0;

      // Build base query without orderBy (orderBy breaks count queries)
      let query = db('users')
        .where('is_active', true);

      // SECURITY: Organization filter is critical to prevent IDOR attacks
      if (filters?.organization_id) {
        query = query.where('organization_id', filters.organization_id);
      }

      if (filters?.role) {
        query = query.where('role', filters.role);
      }

      if (filters?.department) {
        query = query.where('department', filters.department);
      }

      if (filters?.manager_id) {
        query = query.where('manager_id', filters.manager_id);
      }

      // Get total count (clone before adding orderBy/limit/offset)
      const countQuery = query.clone();
      const countResult = await countQuery.count('id as count');
      const countRow = countResult[0] as { count?: string | number } | undefined;
      const total = parseInt(String(countRow?.count ?? 0), 10);

      // Get paginated results with ordering
      const users = await query
        .clone()
        .select('*')
        .orderBy('name', 'asc')
        .limit(limit)
        .offset(offset);

      // Remove sensitive information from all users
      const sanitizedUsers = users.map(user => {
        const { password: _password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      return { users: sanitizedUsers, total };
    } catch (error) {
      logger.error('Error fetching users:', error);
      throw error;
    }
  }

  /**
   * Deactivates a user by setting is_active to false.
   * Deactivated users cannot log in but their data is preserved.
   * @param id - The UUID of the user to deactivate
   * @throws {NotFoundError} If the user with the given ID does not exist
   */
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
