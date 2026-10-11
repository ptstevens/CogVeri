/**
 * Test Database Utilities
 *
 * Provides functions for managing test database state including:
 * - Database reset and cleanup
 * - Test data seeding
 * - User and organization creation
 * - Transaction helpers for test isolation
 */

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

// Type definitions for test data
export interface TestUser {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  organization_id: string;
  is_system_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  max_members: number;
  max_recordings_gb: number;
  max_tasks_per_month: number;
  created_at: Date;
  updated_at: Date;
}

export interface TestTask {
  id: string;
  organization_id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assigned_to?: string;
  created_by: string;
  reviewed_by?: string;
  due_date?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TestRecording {
  id: string;
  task_id: string;
  user_id: string;
  organization_id: string;
  type: string;
  status: string;
  file_url?: string;
  file_size_bytes?: string;
  duration_seconds?: number;
  created_at: Date;
  updated_at: Date;
}

export interface TestMagicLink {
  id: string;
  task_id: string;
  token: string;
  email: string;
  organization_id: string;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Database utilities class for test management
 */
export class TestDatabaseUtils {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  /**
   * Reset the entire test database
   * Truncates all tables in the correct order to respect foreign key constraints
   */
  async resetDatabase(): Promise<void> {
    // Disable foreign key checks temporarily
    await this.db.raw('SET session_replication_role = replica');

    try {
      // Truncate all tables in order (child tables first)
      const tables = [
        'task_access_logs',
        'task_access_tokens',
        'external_contributors',
        'review_comments',
        'reviews',
        'recordings',
        'recording_file_sizes',
        'notifications',
        'activity_logs',
        'audit_logs',
        'api_metrics',
        'storage_metrics',
        'retention_policies',
        'retention_executions',
        'api_keys',
        'tasks',
        'task_templates',
        'memberships',
        'domain_verification_requests',
        'subscriber_emails',
        'organization_audit_logs',
        'admin_impersonation_tokens',
        'users',
        'organizations',
      ];

      for (const table of tables) {
        try {
          await this.db.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
        } catch (error) {
          // Table might not exist, continue
        }
      }
    } finally {
      // Re-enable foreign key checks
      await this.db.raw('SET session_replication_role = DEFAULT');
    }
  }

  /**
   * Seed the database with test data
   * Creates a basic test organization, users, and sample data
   */
  async seedTestData(): Promise<{
    organization: TestOrganization;
    users: TestUser[];
    tasks: TestTask[];
  }> {
    const organization = await this.createTestOrganization();

    const adminUser = await this.createTestUser({
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'admin',
      organization_id: organization.id,
      is_system_admin: true,
    });

    const regularUser = await this.createTestUser({
      email: 'user@test.com',
      name: 'Regular User',
      role: 'employee',
      organization_id: organization.id,
    });

    const reviewerUser = await this.createTestUser({
      email: 'reviewer@test.com',
      name: 'Reviewer User',
      role: 'reviewer',
      organization_id: organization.id,
    });

    // Create memberships
    await this.createMembership(adminUser.id, organization.id, 'OWNER');
    await this.createMembership(regularUser.id, organization.id, 'MEMBER');
    await this.createMembership(reviewerUser.id, organization.id, 'MEMBER');

    // Create sample tasks
    const task1 = await this.createTestTask({
      organization_id: organization.id,
      title: 'Complete onboarding recording',
      description: 'Record yourself completing the onboarding flow',
      created_by: adminUser.id,
      assigned_to: regularUser.id,
      reviewed_by: reviewerUser.id,
    });

    const task2 = await this.createTestTask({
      organization_id: organization.id,
      title: 'Product demo recording',
      description: 'Create a demo of the main product features',
      created_by: adminUser.id,
      assigned_to: regularUser.id,
      status: 'in_progress',
    });

    return {
      organization,
      users: [adminUser, regularUser, reviewerUser],
      tasks: [task1, task2],
    };
  }

  /**
   * Create a test organization
   */
  async createTestOrganization(
    overrides: Partial<TestOrganization> = {}
  ): Promise<TestOrganization> {
    const id = overrides.id || uuidv4();
    const organization: TestOrganization = {
      id,
      name: overrides.name || 'Test Organization',
      slug: overrides.slug || `test-org-${id.slice(0, 8)}`,
      subscription_tier: overrides.subscription_tier || 'pro',
      max_members: overrides.max_members || 50,
      max_recordings_gb: overrides.max_recordings_gb || 100,
      max_tasks_per_month: overrides.max_tasks_per_month || 99999,
      created_at: overrides.created_at || new Date(),
      updated_at: overrides.updated_at || new Date(),
    };

    await this.db('organizations').insert(organization);
    return organization;
  }

  /**
   * Create a test user
   */
  async createTestUser(
    overrides: Partial<TestUser> & { password?: string } = {}
  ): Promise<TestUser> {
    const id = overrides.id || uuidv4();
    const password = overrides.password || 'testpassword123';
    const passwordHash = await bcrypt.hash(password, 10);

    const user: TestUser = {
      id,
      email: overrides.email || `user-${id.slice(0, 8)}@test.com`,
      name: overrides.name || 'Test User',
      password_hash: overrides.password_hash || passwordHash,
      role: overrides.role || 'employee',
      organization_id: overrides.organization_id || uuidv4(),
      is_system_admin: overrides.is_system_admin || false,
      created_at: overrides.created_at || new Date(),
      updated_at: overrides.updated_at || new Date(),
    };

    await this.db('users').insert(user);
    return user;
  }

  /**
   * Create a membership between user and organization
   */
  async createMembership(
    userId: string,
    organizationId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER'
  ): Promise<void> {
    await this.db('memberships').insert({
      id: uuidv4(),
      user_id: userId,
      organization_id: organizationId,
      role,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Create a test task
   */
  async createTestTask(overrides: Partial<TestTask> = {}): Promise<TestTask> {
    const id = overrides.id || uuidv4();
    const task: TestTask = {
      id,
      organization_id: overrides.organization_id || uuidv4(),
      title: overrides.title || 'Test Task',
      description: overrides.description || 'This is a test task',
      type: overrides.type || 'recording',
      status: overrides.status || 'assigned',
      priority: overrides.priority || 'medium',
      assigned_to: overrides.assigned_to,
      created_by: overrides.created_by || uuidv4(),
      reviewed_by: overrides.reviewed_by,
      due_date: overrides.due_date,
      created_at: overrides.created_at || new Date(),
      updated_at: overrides.updated_at || new Date(),
    };

    await this.db('tasks').insert(task);
    return task;
  }

  /**
   * Create a test recording
   */
  async createTestRecording(overrides: Partial<TestRecording> = {}): Promise<TestRecording> {
    const id = overrides.id || uuidv4();
    const recording: TestRecording = {
      id,
      task_id: overrides.task_id || uuidv4(),
      user_id: overrides.user_id || uuidv4(),
      organization_id: overrides.organization_id || uuidv4(),
      type: overrides.type || 'screen',
      status: overrides.status || 'completed',
      file_url: overrides.file_url || 'https://storage.example.com/recording.webm',
      file_size_bytes: overrides.file_size_bytes || '10485760',
      duration_seconds: overrides.duration_seconds || 300,
      created_at: overrides.created_at || new Date(),
      updated_at: overrides.updated_at || new Date(),
    };

    await this.db('recordings').insert(recording);
    return recording;
  }

  /**
   * Create a test magic link
   */
  async createTestMagicLink(overrides: Partial<TestMagicLink> = {}): Promise<TestMagicLink> {
    const id = overrides.id || uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Generate a secure token
    const token = overrides.token || require('crypto').randomBytes(32).toString('hex');

    const magicLink: TestMagicLink = {
      id,
      task_id: overrides.task_id || uuidv4(),
      token,
      email: overrides.email || 'external@test.com',
      organization_id: overrides.organization_id || uuidv4(),
      expires_at: overrides.expires_at || expiresAt,
      is_revoked: overrides.is_revoked || false,
      created_at: overrides.created_at || new Date(),
      updated_at: overrides.updated_at || new Date(),
    };

    await this.db('task_access_tokens').insert(magicLink);
    return magicLink;
  }

  /**
   * Create an external contributor
   */
  async createTestExternalContributor(overrides: Record<string, any> = {}): Promise<any> {
    const id = overrides.id || uuidv4();
    const contributor = {
      id,
      email: overrides.email || 'external@test.com',
      organization_id: overrides.organization_id || uuidv4(),
      first_name: overrides.first_name || 'External',
      last_name: overrides.last_name || 'Contributor',
      total_tasks_assigned: overrides.total_tasks_assigned || 0,
      total_tasks_completed: overrides.total_tasks_completed || 0,
      total_tasks_rejected: overrides.total_tasks_rejected || 0,
      created_at: overrides.created_at || new Date(),
      updated_at: overrides.updated_at || new Date(),
    };

    await this.db('external_contributors').insert(contributor);
    return contributor;
  }

  /**
   * Run a test within a transaction that gets rolled back
   * This ensures test isolation without affecting other tests
   */
  async withTransaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (trx) => {
      try {
        const result = await callback(trx);
        // Rollback to ensure no data persists
        await trx.rollback();
        return result;
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    });
  }

  /**
   * Get a fresh database connection for isolated tests
   */
  getConnection(): Knex {
    return this.db;
  }

  /**
   * Clean up specific test data by organization ID
   */
  async cleanupByOrganization(organizationId: string): Promise<void> {
    await this.db.raw('SET session_replication_role = replica');

    try {
      // Delete in correct order to respect foreign keys
      await this.db('task_access_logs').where('organization_id', organizationId).del();
      await this.db('task_access_tokens').where('organization_id', organizationId).del();
      await this.db('external_contributors').where('organization_id', organizationId).del();
      await this.db('review_comments')
        .whereIn(
          'review_id',
          this.db('reviews')
            .select('id')
            .whereIn(
              'task_id',
              this.db('tasks').select('id').where('organization_id', organizationId)
            )
        )
        .del();
      await this.db('reviews')
        .whereIn('task_id', this.db('tasks').select('id').where('organization_id', organizationId))
        .del();
      await this.db('recordings').where('organization_id', organizationId).del();
      await this.db('notifications')
        .whereIn('user_id', this.db('users').select('id').where('organization_id', organizationId))
        .del();
      await this.db('tasks').where('organization_id', organizationId).del();
      await this.db('memberships').where('organization_id', organizationId).del();
      await this.db('users').where('organization_id', organizationId).del();
      await this.db('organizations').where('id', organizationId).del();
    } finally {
      await this.db.raw('SET session_replication_role = DEFAULT');
    }
  }

  /**
   * Count records in a table (useful for assertions)
   */
  async countRecords(table: string, where?: Record<string, any>): Promise<number> {
    let query = this.db(table).count('* as count');
    if (where) {
      query = query.where(where);
    }
    const result = await query.first();
    return parseInt(result?.count as string) || 0;
  }

  /**
   * Check if a record exists
   */
  async recordExists(table: string, where: Record<string, any>): Promise<boolean> {
    const count = await this.countRecords(table, where);
    return count > 0;
  }

  /**
   * Get a single record by ID
   */
  async getById<T>(table: string, id: string): Promise<T | undefined> {
    return await this.db(table).where('id', id).first();
  }

  /**
   * Update a record by ID
   */
  async updateById(table: string, id: string, data: Record<string, any>): Promise<void> {
    await this.db(table)
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date(),
      });
  }

  /**
   * Delete a record by ID
   */
  async deleteById(table: string, id: string): Promise<void> {
    await this.db(table).where('id', id).del();
  }
}

/**
 * Create a database utilities instance
 * Use this in tests to get access to database helper functions
 */
export function createTestDbUtils(db: Knex): TestDatabaseUtils {
  return new TestDatabaseUtils(db);
}

/**
 * Generate a unique test email
 */
export function generateTestEmail(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

/**
 * Generate a unique organization slug
 */
export function generateTestSlug(prefix: string = 'test-org'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wait for a condition to be true (useful for async assertions)
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

export default TestDatabaseUtils;
