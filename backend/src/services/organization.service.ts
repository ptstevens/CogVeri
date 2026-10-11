import { db } from '../config/database';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import taskTemplateService from './task-template.service';
import storageService from './storage.service';
import recordingService from './recording.service';
// Commented out: domain-verification and auto-provisioning services (Task 21)
// import { domainVerificationService } from './domain-verification.service';
// import { autoProvisioningService } from './auto-provisioning.service';
// import { subscriberEmailService } from './subscriber-email.service';

/**
 * Generate a URL-safe slug from an organization name
 * Example: "Acme Corp Inc." -> "acme-corp-inc"
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug, appending a number if needed
 */
async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = generateSlug(name);

  // Check if the base slug is available
  const existing = await db('organizations').where('slug', baseSlug).first();
  if (!existing) {
    return baseSlug;
  }

  // Find a unique slug by appending a number
  let counter = 2;
  while (true) {
    const candidateSlug = `${baseSlug}-${counter}`;
    const exists = await db('organizations').where('slug', candidateSlug).first();
    if (!exists) {
      return candidateSlug;
    }
    counter++;
    if (counter > 100) {
      // Fallback: append timestamp
      return `${baseSlug}-${Date.now()}`;
    }
  }
}

interface CreateOrganizationInput {
  name: string;
  description?: string;
  domain?: string;
  ownerId: string;
  subscriptionTier?: string;
  logoUrl?: string;
}

interface OrganizationSignupFlow {
  organizationId?: string;
  organizationName: string;
  domain: string;
  status: 'new_organization' | 'existing_unverified' | 'existing_verified' | 'auto_provisioned';
  message: string;
  nextSteps: string[];
  verificationRequired: boolean;
  autoProvisioned: boolean;
}

class OrganizationService {
  /**
   * Create a new organization
   */
  async createOrganization(input: CreateOrganizationInput): Promise<{
    id: string;
    name: string;
    ownerId: string;
  }> {
    try {
      logger.info(`📋 Creating new organization: ${input.name}`);

      // Verify owner exists
      const owner = await db('users').where('id', input.ownerId).first();
      if (!owner) {
        throw new Error(`Owner user not found: ${input.ownerId}`);
      }

      // Generate a unique URL-safe slug for this organization
      const slug = await generateUniqueSlug(input.name);
      logger.info(`📝 Generated slug for organization: ${slug}`);

      // Create organization with billing contact defaulting to owner
      const result = await db('organizations')
        .insert({
          name: input.name,
          slug: slug, // URL-safe identifier for storage paths
          description: input.description || '',
          logo_url: input.logoUrl || null,
          subscription_tier: input.subscriptionTier || 'free',
          owner_id: input.ownerId,
          owner_email: owner.email,
          is_active: true,
          is_suspended: false,
          auto_provision_enabled: true,
          // Set billing contact to owner by default
          billing_email: owner.email,
          billing_name: owner.name || owner.email,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('id');

      const organizationId = Array.isArray(result) ? result[0]?.id || result[0] : result;

      logger.info(`✅ Organization created: ${organizationId} (${input.name})`);

      const now = new Date();

      // Add owner as organization member with owner role (legacy table)
      await db('users').where('id', input.ownerId).update({
        organization_id: organizationId,
        current_organization_id: organizationId,
        org_role: 'owner',
        org_status: 'active',
        joined_organization_at: now,
      });

      // Add owner to organization_members table (new multi-org model)
      await db('organization_members').insert({
        user_id: input.ownerId,
        organization_id: organizationId,
        role: 'owner',
        status: 'active',
        joined_at: now,
        created_at: now,
        updated_at: now,
      });

      logger.info(`✅ Owner added to organization with owner role`);

      // Copy system default templates to the new organization
      // This gives the org ownership of template copies they can edit/delete
      try {
        await taskTemplateService.copyAllSystemDefaultsToOrganization(
          organizationId.toString(),
          input.ownerId
        );
        logger.info(`✅ System default templates copied to organization`);
      } catch (templateError) {
        // Log but don't fail org creation if template copy fails
        logger.error('Failed to copy system templates (non-fatal):', templateError);
      }

      // Create storage folder structure for organization
      // Uses folder-based isolation within the environment bucket (cogveri-main or cogveri-staging)
      try {
        await storageService.createOrgFolders(slug);
        logger.info(`✅ Storage folders created for org: ${slug}`);
      } catch (folderError) {
        // Log but don't fail org creation if folder creation fails
        logger.error('Failed to create storage folders (non-fatal):', folderError);
      }

      return {
        id: organizationId.toString(),
        name: input.name,
        ownerId: input.ownerId,
      };
    } catch (error) {
      logger.error('Error creating organization:', error);
      throw error;
    }
  }

  /**
   * Enhanced signup flow: handles domain verification and auto-provisioning
   * Called during user signup to determine organization assignment
   */
  async handleSignupOrganizationFlow(
    _userId: string,
    userEmail: string
  ): Promise<OrganizationSignupFlow> {
    try {
      logger.info(`🔄 Handling organization signup flow for user: ${userEmail}`);

      // Extract domain from email
      const domain = this.extractDomain(userEmail);

      // Check if domain is claimed by another organization (unverified or pending)
      const claimedOrg = await db('organizations').where('domain', domain).first();

      if (claimedOrg && !claimedOrg.domain_verified) {
        logger.info(`⚠️  Domain ${domain} already claimed but not yet verified`);

        return {
          organizationId: claimedOrg.id,
          organizationName: claimedOrg.name,
          domain: domain,
          status: 'existing_unverified',
          message: `This domain is already claimed by ${claimedOrg.name}, but domain verification is not complete. You can wait for verification or create a personal workspace.`,
          nextSteps: [
            'Wait for organization admin to complete domain verification',
            'Or create a personal workspace to get started',
          ],
          verificationRequired: true,
          autoProvisioned: false,
        };
      }

      // New organization - user can create one
      logger.info(
        `✨ No matching organization found. User can create new organization for domain: ${domain}`
      );

      return {
        organizationName: 'Your Organization',
        domain: domain,
        status: 'new_organization',
        message: `No organization found for domain ${domain}. You can create a new organization and claim this domain.`,
        nextSteps: [
          'Create a new organization for your domain',
          'Complete domain verification via email or DNS',
          'Invite team members with matching email addresses',
        ],
        verificationRequired: true,
        autoProvisioned: false,
      };
    } catch (error) {
      logger.error('Error handling signup organization flow:', error);
      // Don't throw - allow signup to continue even if flow fails
      // Return default response to allow user to create new org
      return {
        organizationName: 'Your Organization',
        domain: this.extractDomain(userEmail) || 'domain.com',
        status: 'new_organization',
        message: 'You can create a new organization',
        nextSteps: ['Create organization', 'Complete domain verification'],
        verificationRequired: true,
        autoProvisioned: false,
      };
    }
  }

  /**
   * Get organization by ID with full details
   */
  async getOrganization(organizationId: string): Promise<Record<string, unknown>> {
    try {
      const org = await db('organizations').where('id', organizationId).first();

      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      return org;
    } catch (error) {
      logger.error('Error fetching organization:', error);
      throw error;
    }
  }

  /**
   * Get all organizations (system admin endpoint)
   */
  async getAllOrganizations(
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    organizations: any[];
    total: number;
  }> {
    try {
      logger.info(`📊 Fetching all organizations (limit: ${limit}, offset: ${offset})`);

      const organizations = await db('organizations')
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      const countResult = await db('organizations').count('id as total').first();

      const total = Number(countResult?.total) || 0;

      // NOTE: member count enrichment pending auto-provisioning service (Task 21)
      return {
        organizations,
        total,
      };
    } catch (error) {
      logger.error('Error fetching all organizations:', error);
      throw error;
    }
  }

  /**
   * Get user's organizations
   */
  async getUserOrganizations(userId: string): Promise<Record<string, unknown>[]> {
    try {
      const organizations = await db('organizations')
        .whereIn('id', db('users').where('id', userId).select('organization_id'))
        .select('*')
        .orderBy('created_at', 'desc');

      return organizations;
    } catch (error) {
      logger.error('Error fetching user organizations:', error);
      throw error;
    }
  }

  /**
   * Update organization details
   */
  async updateOrganization(
    organizationId: string,
    updates: Partial<CreateOrganizationInput>
  ): Promise<void> {
    try {
      logger.info(`📝 Updating organization: ${organizationId}`);

      const updateData: any = {
        updated_at: new Date(),
      };

      if (updates.name) updateData.name = updates.name;
      if (updates.description) updateData.description = updates.description;
      if (updates.logoUrl) updateData.logo_url = updates.logoUrl;
      if (updates.subscriptionTier) updateData.subscription_tier = updates.subscriptionTier;

      await db('organizations').where('id', organizationId).update(updateData);

      logger.info(`✅ Organization updated: ${organizationId}`);

      // Log audit trail
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        action: 'organization_updated',
        resource_type: 'organization',
        resource_id: organizationId,
        changes: updateData,
        status: 'success',
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error updating organization:', error);
      throw error;
    }
  }

  /**
   * Suspend organization (prevent all access)
   */
  async suspendOrganization(organizationId: string, reason?: string): Promise<void> {
    try {
      logger.info(`🚫 Suspending organization: ${organizationId}`);

      await db('organizations').where('id', organizationId).update({
        is_suspended: true,
        updated_at: new Date(),
      });

      logger.info(`✅ Organization suspended: ${organizationId}`);

      // Log audit trail
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        action: 'organization_suspended',
        resource_type: 'organization',
        resource_id: organizationId,
        changes: { reason: reason || 'suspended by admin' },
        status: 'success',
        created_at: new Date(),
      });

      // Notify organization owner
      try {
        const org = await db('organizations').where('id', organizationId).first();
        const owner = await db('users').where('id', org.owner_id).first();

        const html = `
          <p>Your organization <strong>${org.name}</strong> has been suspended.</p>
          <p>Reason: ${reason || 'Not specified'}</p>
          <p>Please contact support for more information.</p>
        `;

        await emailService.sendEmail({
          to: owner.email,
          subject: `Organization Suspended: ${org.name}`,
          html,
        });
      } catch (emailError) {
        logger.warn(`Failed to send suspension email: ${emailError}`);
      }
    } catch (error) {
      logger.error('Error suspending organization:', error);
      throw error;
    }
  }

  /**
   * Unsuspend organization (restore access)
   */
  async unsuspendOrganization(organizationId: string): Promise<void> {
    try {
      logger.info(`✅ Unsuspending organization: ${organizationId}`);

      await db('organizations').where('id', organizationId).update({
        is_suspended: false,
        updated_at: new Date(),
      });

      logger.info(`✅ Organization unsuspended: ${organizationId}`);

      // Log audit trail
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        action: 'organization_unsuspended',
        resource_type: 'organization',
        resource_id: organizationId,
        status: 'success',
        created_at: new Date(),
      });

      // Notify organization owner
      try {
        const org = await db('organizations').where('id', organizationId).first();
        const owner = await db('users').where('id', org.owner_id).first();

        const html = `
          <p>Your organization <strong>${org.name}</strong> has been restored.</p>
          <p>You can now resume normal operations.</p>
        `;

        await emailService.sendEmail({
          to: owner.email,
          subject: `Organization Restored: ${org.name}`,
          html,
        });
      } catch (emailError) {
        logger.warn(`Failed to send restoration email: ${emailError}`);
      }
    } catch (error) {
      logger.error('Error unsuspending organization:', error);
      throw error;
    }
  }

  /**
   * Delete organization (with cascading cleanup)
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    try {
      logger.info(`🗑️  Deleting organization: ${organizationId}`);

      const org = await db('organizations').where('id', organizationId).first();

      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      // Step 1: Delete all recording files BEFORE deleting database records
      // This is important because we need the recording info to find the files
      logger.info(`Deleting all recordings and files for organization: ${organizationId}`);

      const tasks = await db('tasks').where('organization_id', organizationId).select('id');

      let totalRecordingsDeleted = 0;
      for (const task of tasks) {
        try {
          const recordings = await db('recordings').where('task_id', task.id).select('id');

          for (const recording of recordings) {
            await recordingService.hardDeleteRecording(recording.id);
            totalRecordingsDeleted++;
          }
        } catch (recordingError) {
          logger.error(`Failed to delete recordings for task ${task.id}:`, recordingError);
          // Continue with other tasks
        }
      }
      logger.info(
        `✅ Deleted ${totalRecordingsDeleted} recordings for organization: ${organizationId}`
      );

      // Step 2: Delete all storage for the organization (folder-based cleanup)
      try {
        const result = await storageService.deleteOrgStorage(org.slug);
        logger.info(`✅ Storage deleted for organization: ${organizationId}`, {
          orgSlug: org.slug,
          deleted: result.deleted,
          errors: result.errors,
        });
      } catch (storageError) {
        // Log but continue with org deletion even if storage delete fails
        logger.error('Failed to delete storage (continuing with org deletion):', storageError);
      }

      // Step 3: Check which optional tables exist (BEFORE transaction to avoid PG abort issues)
      // PostgreSQL aborts transactions on ANY error, even caught ones
      // Comprehensive list of all tables with organization_id based on migrations review
      const optionalTables = [
        // Core optional tables
        'notifications',
        'activity_logs',
        'organization_audit_logs',
        'impersonation_logs',
        'organization_feature_grants',
        'domain_verification_requests',
        'upload_sessions',
        // Billing tables
        'subscriptions',
        'invoices',
        'payment_methods',
        'billing_events',
        'organization_subscriptions',
        'organization_usage',
        'billing_disputes',
        'checkout_sessions',
        // Storage/retention tables
        'storage_metrics',
        'recording_retention_policies',
        'retention_execution_logs',
        'storage_quota_alerts',
        // API/usage tracking tables
        'api_metrics',
        'api_usage_summary',
        'rate_limit_rules',
        'rate_limit_violations',
        'feature_usage',
        'api_keys',
        // Analysis tables
        'analysis_jobs',
        'processing_jobs',
        // Recording-related tables
        'recording_file_sizes',
        'transcription_jobs',
        // External contributor/magic link tables (NOT magic_links - that table doesn't exist!)
        'external_contributors',
        'task_access_tokens',
        'task_access_logs',
      ];

      const existingTables = new Set<string>();
      for (const table of optionalTables) {
        const exists = await db.schema.hasTable(table);
        if (exists) {
          existingTables.add(table);
        }
      }

      // Check if reviews table has organization_id column (added in migration 057)
      const reviewsHasOrgId = await db.schema.hasColumn('reviews', 'organization_id');

      // Step 4: Delete database records in transaction
      // IMPORTANT: Order matters - delete dependent records before parent records
      await db.transaction(async (trx) => {
        // --- Analysis tables (depend on recordings/tasks) ---
        if (existingTables.has('analysis_jobs')) {
          await trx('analysis_jobs').where('organization_id', organizationId).del();
        }
        if (existingTables.has('processing_jobs')) {
          await trx('processing_jobs').where('organization_id', organizationId).del();
        }

        // --- Recording-related tables ---
        if (existingTables.has('recording_file_sizes')) {
          await trx('recording_file_sizes').where('organization_id', organizationId).del();
        }
        if (existingTables.has('transcription_jobs')) {
          await trx('transcription_jobs').where('organization_id', organizationId).del();
        }

        // --- External contributor / magic link system ---
        if (existingTables.has('task_access_logs')) {
          await trx('task_access_logs').where('organization_id', organizationId).del();
        }
        if (existingTables.has('task_access_tokens')) {
          await trx('task_access_tokens').where('organization_id', organizationId).del();
        }
        if (existingTables.has('external_contributors')) {
          await trx('external_contributors').where('organization_id', organizationId).del();
        }

        // --- Storage/retention tables ---
        if (existingTables.has('retention_execution_logs')) {
          await trx('retention_execution_logs').where('organization_id', organizationId).del();
        }
        if (existingTables.has('recording_retention_policies')) {
          await trx('recording_retention_policies').where('organization_id', organizationId).del();
        }
        if (existingTables.has('storage_quota_alerts')) {
          await trx('storage_quota_alerts').where('organization_id', organizationId).del();
        }
        if (existingTables.has('storage_metrics')) {
          await trx('storage_metrics').where('organization_id', organizationId).del();
        }

        // --- Billing tables ---
        if (existingTables.has('billing_disputes')) {
          await trx('billing_disputes').where('organization_id', organizationId).del();
        }
        if (existingTables.has('checkout_sessions')) {
          await trx('checkout_sessions').where('organization_id', organizationId).del();
        }
        if (existingTables.has('billing_events')) {
          await trx('billing_events').where('organization_id', organizationId).del();
        }
        if (existingTables.has('invoices')) {
          await trx('invoices').where('organization_id', organizationId).del();
        }
        if (existingTables.has('payment_methods')) {
          await trx('payment_methods').where('organization_id', organizationId).del();
        }
        if (existingTables.has('subscriptions')) {
          await trx('subscriptions').where('organization_id', organizationId).del();
        }
        if (existingTables.has('organization_subscriptions')) {
          await trx('organization_subscriptions').where('organization_id', organizationId).del();
        }
        if (existingTables.has('organization_usage')) {
          await trx('organization_usage').where('organization_id', organizationId).del();
        }

        // --- API/usage tracking tables ---
        if (existingTables.has('rate_limit_violations')) {
          await trx('rate_limit_violations').where('organization_id', organizationId).del();
        }
        if (existingTables.has('rate_limit_rules')) {
          await trx('rate_limit_rules').where('organization_id', organizationId).del();
        }
        if (existingTables.has('api_keys')) {
          await trx('api_keys').where('organization_id', organizationId).del();
        }
        if (existingTables.has('feature_usage')) {
          await trx('feature_usage').where('organization_id', organizationId).del();
        }
        if (existingTables.has('api_usage_summary')) {
          await trx('api_usage_summary').where('organization_id', organizationId).del();
        }
        if (existingTables.has('api_metrics')) {
          await trx('api_metrics').where('organization_id', organizationId).del();
        }

        // --- Audit/logging tables ---
        if (existingTables.has('activity_logs')) {
          await trx('activity_logs').where('organization_id', organizationId).del();
        }
        if (existingTables.has('organization_audit_logs')) {
          await trx('organization_audit_logs').where('organization_id', organizationId).del();
        }
        if (existingTables.has('impersonation_logs')) {
          await trx('impersonation_logs').where('organization_id', organizationId).del();
        }

        // --- Other optional tables ---
        if (existingTables.has('notifications')) {
          await trx('notifications').where('organization_id', organizationId).del();
        }
        if (existingTables.has('upload_sessions')) {
          await trx('upload_sessions').where('organization_id', organizationId).del();
        }
        if (existingTables.has('domain_verification_requests')) {
          await trx('domain_verification_requests').where('organization_id', organizationId).del();
        }
        if (existingTables.has('organization_feature_grants')) {
          await trx('organization_feature_grants').where('organization_id', organizationId).del();
        }

        // --- Clear current_organization_id from users (SET NULL behavior) ---
        await trx('users')
          .where('current_organization_id', organizationId)
          .update({ current_organization_id: null });

        // Remove users from organization (don't delete users, just deassociate)
        await trx('users').where('organization_id', organizationId).update({
          organization_id: null,
          org_role: null,
          org_status: 'inactive',
        });

        // --- Reviews (conditionally if column exists) ---
        if (reviewsHasOrgId) {
          await trx('reviews').where('organization_id', organizationId).del();
        }

        // --- Organization Members and Invitations ---
        await trx('organization_members').where('organization_id', organizationId).del();
        await trx('organization_invitations').where('organization_id', organizationId).del();

        // --- Tasks (cascades to recordings via foreign keys) ---
        // Note: Recordings were deleted in Step 1 with their files
        await trx('tasks').where('organization_id', organizationId).del();

        // --- Task Templates ---
        await trx('task_templates').where('organization_id', organizationId).del();

        // --- Organization Bucket Record ---
        await trx('organization_buckets').where('organization_id', organizationId).del();

        // --- Finally delete the organization itself ---
        await trx('organizations').where('id', organizationId).del();
      });

      logger.info(`✅ Organization fully deleted: ${organizationId} (${org.name})`);
    } catch (error) {
      logger.error('Error deleting organization:', error);
      throw error;
    }
  }

  /**
   * Initiate domain verification for organization
   */
  async initiateDomainVerification(
    organizationId: string,
    domain: string,
    method: 'email' | 'dns',
    _adminEmail?: string
  ): Promise<Record<string, unknown>> {
    try {
      logger.info(
        `🌐 Initiating ${method} domain verification for org ${organizationId}: ${domain}`
      );

      // NOTE: Full implementation pending domain-verification service (Task 21)
      throw new Error('Domain verification service not yet implemented');
    } catch (error) {
      logger.error('Error initiating domain verification:', error);
      throw error;
    }
  }

  /**
   * Helper: Extract domain from email
   */
  /**
   * Check if domain is already claimed by another organization
   * Prevents domain hijacking and duplicate domain registration
   */
  async checkDomainAvailability(domain: string): Promise<{
    available: boolean;
    existingOrganization?: {
      id: string;
      name: string;
      domain_verified: boolean;
    };
    message?: string;
  }> {
    try {
      logger.info(`🔍 Checking domain availability: ${domain}`);

      const normalizedDomain = domain.toLowerCase().trim();

      // Check if domain already exists
      const existingOrg = await db('organizations').where('domain', normalizedDomain).first();

      if (existingOrg) {
        const status = existingOrg.domain_verified ? 'verified' : 'unverified';
        logger.warn(`⚠️  Domain ${domain} already claimed (${status})`);

        return {
          available: false,
          existingOrganization: {
            id: existingOrg.id,
            name: existingOrg.name,
            domain_verified: existingOrg.domain_verified,
          },
          message: `This domain is already claimed by "${existingOrg.name}" (${status})`,
        };
      }

      logger.info(`✅ Domain ${domain} is available`);
      return {
        available: true,
        message: 'Domain is available for registration',
      };
    } catch (error) {
      logger.error('Error checking domain availability:', error);
      throw error;
    }
  }

  /**
   * Prevent duplicate domain during organization creation
   * Called before createOrganization to validate domain uniqueness
   */
  async validateDomainForCreation(
    email: string,
    domainOverride?: string
  ): Promise<{
    valid: boolean;
    domain: string;
    message: string;
  }> {
    try {
      const domain = (domainOverride || this.extractDomain(email)).toLowerCase();

      logger.info(`✔️  Validating domain for creation: ${domain}`);

      // Check if domain already exists in organizations
      const existingOrg = await db('organizations').where('domain', domain).first();

      if (existingOrg) {
        const message = existingOrg.domain_verified
          ? `Domain "${domain}" is already registered with ${existingOrg.name}`
          : `Domain "${domain}" is already claimed (pending verification). Organization: ${existingOrg.name}`;

        logger.warn(`❌ Domain validation failed: ${message}`);

        return {
          valid: false,
          domain,
          message,
        };
      }

      // Check if domain has pending verification requests
      const pendingVerification = await db('domain_verification_requests')
        .where('domain', domain)
        .where('status', 'pending')
        .first();

      if (pendingVerification) {
        logger.warn(`⚠️  Domain ${domain} has pending verification`);

        return {
          valid: false,
          domain,
          message: `Domain "${domain}" is pending verification. Please try again after verification is complete.`,
        };
      }

      logger.info(`✅ Domain ${domain} validation passed`);

      return {
        valid: true,
        domain,
        message: 'Domain is valid and available',
      };
    } catch (error) {
      logger.error('Error validating domain for creation:', error);
      throw error;
    }
  }

  private extractDomain(email: string): string {
    const match = email.match(/@(.+)$/);
    return match?.[1]?.toLowerCase() ?? 'domain.com';
  }
}

export const organizationService = new OrganizationService();
