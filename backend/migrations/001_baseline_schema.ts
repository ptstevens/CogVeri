import { Knex } from 'knex';

/**
 * CogVeri Baseline Schema Migration
 *
 * This single migration creates the complete database schema for CogVeri.
 * Consolidated from 77 incremental migrations for cleaner history.
 *
 * Schema Organization:
 * 1. RLS Infrastructure Functions
 * 2. Core Tables (organizations, users)
 * 3. Multi-Tenancy Tables (organization_members, invitations)
 * 4. Task & Recording Tables
 * 5. Review & Notification Tables
 * 6. Billing & Subscription Tables
 * 7. Analysis & Transcription Tables
 * 8. Storage & Retention Tables
 * 9. API & Security Tables
 * 10. Indexes & Constraints
 * 11. RLS Policies
 * 12. Triggers & Functions
 */

export async function up(knex: Knex): Promise<void> {
  console.log('🚀 Creating CogVeri baseline schema...');

  // ============================================================
  // SECTION 1: RLS INFRASTRUCTURE FUNCTIONS
  // ============================================================
  console.log('  → Creating RLS infrastructure functions...');

  await knex.raw(`
    -- Session variable functions for RLS context
    CREATE OR REPLACE FUNCTION set_current_org(org_id uuid) RETURNS void AS $$
    BEGIN
      PERFORM set_config('app.current_org', org_id::text, false);
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION get_current_org() RETURNS uuid AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_org', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;

    CREATE OR REPLACE FUNCTION set_current_user_id(user_id uuid) RETURNS void AS $$
    BEGIN
      PERFORM set_config('app.current_user_id', user_id::text, false);
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS uuid AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // ============================================================
  // SECTION 2: CORE TABLES - Organizations & Users
  // ============================================================
  console.log('  → Creating core tables...');

  // Organizations table
  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('slug', 100).unique();
    table.text('description');
    table.string('logo_url', 500);
    table.string('domain', 255);
    table.boolean('domain_verified').defaultTo(false);
    table.timestamp('domain_verified_at');
    table.string('domain_verification_method', 50);

    // Owner & Subscriber
    table.uuid('owner_id');
    table.string('owner_email', 255);
    table.string('subscriber_email', 255);
    table.timestamp('subscriber_email_verified_at');
    table.string('subscriber_email_transition_pending_to', 255);
    table.string('subscriber_email_transition_token', 255);
    table.timestamp('subscriber_email_transition_expires_at');
    table.boolean('auto_provision_enabled').defaultTo(true);

    // Subscription & Billing
    table.string('subscription_tier', 50).defaultTo('free');
    table.timestamp('subscription_expiry');
    table.string('stripe_customer_id', 255);
    table.string('stripe_subscription_id', 255);
    table.string('subscription_status', 50);
    table.boolean('cancel_at_period_end').defaultTo(false);
    table.timestamp('cancel_at');
    table.timestamp('payment_failed_at');
    table.integer('payment_failure_count').defaultTo(0);
    table.boolean('billing_enabled').defaultTo(false);
    table.string('billing_email', 255);
    table.string('billing_name', 255);
    table.timestamp('grace_period_expires_at');
    table.string('pending_tier_change', 50);
    table.timestamp('tier_change_effective_at');
    table.boolean('has_used_trial').defaultTo(false);

    // Limits
    table.integer('max_tasks');
    table.integer('max_users');
    table.integer('max_storage_gb');
    table.integer('max_members');
    table.integer('max_recordings_gb');
    table.integer('max_tasks_per_month');
    table.integer('max_videos_per_month');
    table.integer('max_video_length_minutes');
    table.integer('max_external_contributors');
    table.integer('max_workspaces');
    table.jsonb('custom_limits');
    table.jsonb('custom_features');

    // Enterprise
    table.jsonb('enterprise_config');
    table.uuid('enterprise_configured_by');
    table.timestamp('enterprise_configured_at');
    table.text('enterprise_notes');
    table.date('contract_start_date');
    table.date('contract_end_date');

    // Status
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_suspended').defaultTo(false);
    table.timestamp('suspended_at');
    table.string('suspended_reason', 255);
    table.timestamp('scheduled_deletion_at');

    // Timestamps
    table.timestamps(true, true);
  });

  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('name', 255);
    table.string('password', 255);
    table.string('avatar_url', 500);
    table.string('role', 50).defaultTo('employee');
    table.string('department', 100);
    table.string('job_title', 100);
    table.string('bio', 500);
    table.string('phone', 50);
    table.uuid('manager_id').references('id').inTable('users').onDelete('SET NULL');

    // SSO & Auth
    table.string('sso_id', 255);
    table.string('sso_provider', 50);
    table.string('google_id', 255);
    table.string('auth_provider', 50).defaultTo('local');
    table.timestamp('password_updated_at');

    // Organization (legacy single-org fields)
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.uuid('current_organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.string('org_role', 50).defaultTo('limited');
    table.string('org_status', 50).defaultTo('active');
    table.timestamp('invited_at');
    table.timestamp('joined_organization_at');

    // System Admin
    table.string('system_role', 50).defaultTo('USER');
    table.boolean('is_system_admin').defaultTo(false);
    table.timestamp('system_admin_since');

    // Onboarding & Preferences
    table.boolean('onboarding_completed').defaultTo(false);
    table.timestamp('onboarding_completed_at');
    table.jsonb('preferences');
    table.jsonb('notification_preferences');

    // Status
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_login_at');

    // Timestamps
    table.timestamps(true, true);
  });

  // Add foreign key for organization owner
  await knex.schema.alterTable('organizations', (table) => {
    table.foreign('owner_id').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('enterprise_configured_by').references('id').inTable('users').onDelete('SET NULL');
  });

  // ============================================================
  // SECTION 3: MULTI-TENANCY TABLES
  // ============================================================
  console.log('  → Creating multi-tenancy tables...');

  // Organization Members (junction table for multi-org support)
  await knex.schema.createTable('organization_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('role', 50).notNullable().defaultTo('limited');
    table.string('status', 50).notNullable().defaultTo('active');
    table.uuid('invited_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('invited_at');
    table.timestamp('joined_at');
    table.timestamps(true, true);
    table.unique(['user_id', 'organization_id']);
  });

  // Organization Invitations
  await knex.schema.createTable('organization_invitations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('email', 255).notNullable();
    table.string('role', 50).notNullable().defaultTo('limited');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('invitation_token', 255).unique();
    table.uuid('invited_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('expires_at');
    table.timestamp('accepted_at');
    table.timestamp('cancelled_at');
    table.timestamps(true, true);
  });

  // ============================================================
  // SECTION 4: TASK & RECORDING TABLES
  // ============================================================
  console.log('  → Creating task & recording tables...');

  // Task Templates
  await knex.schema.createTable('task_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.text('description');
    table.string('category', 100);
    table.string('icon_emoji', 10);
    table.string('type', 50).defaultTo('recording');
    table.text('instructions');
    table.integer('min_duration_seconds');
    table.integer('max_duration_seconds');
    table.jsonb('required_features');
    table.jsonb('evaluation_criteria');
    table.string('priority', 20).defaultTo('medium');
    table.specificType('tags', 'text[]');
    table.jsonb('metadata');
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_system_default').defaultTo(false);
    table.timestamps(true, true);
  });

  // External Contributors
  await knex.schema.createTable('external_contributors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('email', 255).notNullable();
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.integer('total_tasks_assigned').defaultTo(0);
    table.integer('total_tasks_completed').defaultTo(0);
    table.integer('total_tasks_rejected').defaultTo(0);
    table.integer('average_completion_time_seconds');
    table.timestamp('last_active_at');
    table.timestamps(true, true);
    table.unique(['organization_id', 'email']);
  });

  // Tasks
  await knex.schema.createTable('tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('template_id').references('id').inTable('task_templates').onDelete('SET NULL');
    table.string('title', 255).notNullable();
    table.text('description');
    table.text('instructions');
    table.string('type', 50).defaultTo('recording');
    table.string('status', 50).defaultTo('draft');
    table.string('priority', 20).defaultTo('medium');
    table.string('category', 100);
    table.specificType('tags', 'text[]');

    // Assignments
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('assigned_to').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('reviewer_id').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('external_contributor_id').references('id').inTable('external_contributors').onDelete('SET NULL');

    // Duration & Timing
    table.integer('min_duration_seconds');
    table.integer('max_duration_seconds');
    table.integer('estimated_duration');
    table.integer('actual_duration');
    table.timestamp('due_date');
    table.timestamp('started_at');
    table.timestamp('submitted_at');
    table.timestamp('completed_at');
    table.timestamp('claimed_at');

    // External Access
    table.boolean('is_external_task').defaultTo(false);
    table.integer('access_token_expires_days');
    table.string('claim_name', 255);
    table.string('claim_email', 255);

    // Evaluation
    table.jsonb('required_features');
    table.jsonb('evaluation_criteria');
    table.text('rejection_reason');
    table.integer('attempt_number').defaultTo(1);

    // Metadata
    table.jsonb('metadata');
    table.boolean('archived').defaultTo(false);
    table.integer('version').defaultTo(1);

    table.timestamps(true, true);
  });

  // Recordings
  await knex.schema.createTable('recordings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('task_id').references('id').inTable('tasks').onDelete('SET NULL');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('external_contributor_id').references('id').inTable('external_contributors').onDelete('SET NULL');

    // Type & Status
    table.string('type', 50).defaultTo('screen');
    table.string('status', 50).defaultTo('initializing');
    table.string('processing_status', 50).defaultTo('pending');
    table.string('transcode_status', 50).defaultTo('none');
    table.string('thumbnail_status', 50).defaultTo('none');
    table.string('transcription_status', 50).defaultTo('none');
    table.string('analysis_status', 50).defaultTo('none');

    // File Info
    table.string('file_url', 2000);
    table.string('thumbnail_url', 2000);
    table.bigInteger('file_size_bytes');
    table.string('file_format', 50);
    table.string('file_type', 100);
    table.string('mime_type', 100);

    // Video Properties
    table.integer('duration_seconds');
    table.integer('width');
    table.integer('height');
    table.integer('fps');
    table.integer('bitrate');

    // Storage
    table.string('storage_provider', 50);
    table.string('storage_bucket', 255);
    table.string('storage_key', 500);
    table.timestamp('storage_expires_at');

    // Timestamps
    table.timestamp('started_at');
    table.timestamp('ended_at');
    table.timestamp('uploaded_at');
    table.timestamp('processed_at');

    // Transcription
    table.text('transcript_text');
    table.string('transcript_language', 10);
    table.float('transcript_duration_seconds'); // Float to store decimal precision from Whisper
    table.jsonb('transcription');

    // Live Session
    table.string('live_session_id', 255);
    table.specificType('participants', 'text[]');
    table.jsonb('webrtc_stats');

    // Processing
    table.string('processing_error', 1000);
    table.integer('retry_count').defaultTo(0);
    table.jsonb('processing_metadata');
    table.jsonb('metadata');
    table.jsonb('timestamps');

    // Flags
    table.boolean('contains_sensitive_data').defaultTo(false);
    table.timestamp('retention_until');
    table.boolean('is_temp_rubric_generation').defaultTo(false);

    table.timestamps(true, true);
  });

  // Recording Variants (different quality versions)
  await knex.schema.createTable('recording_variants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.string('quality', 50).notNullable();
    table.string('format', 50).notNullable();
    table.string('file_url', 2000);
    table.string('storage_key', 500);
    table.integer('width');
    table.integer('height');
    table.integer('bitrate');
    table.bigInteger('file_size_bytes');
    table.integer('duration_seconds');
    table.string('playlist_url', 2000);
    table.integer('segment_count');
    table.boolean('is_ready').defaultTo(false);
    table.timestamps(true, true);
    table.unique(['recording_id', 'quality']);
  });

  // Upload Sessions (for multipart uploads)
  await knex.schema.createTable('upload_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('external_contributor_id').references('id').inTable('external_contributors').onDelete('SET NULL');
    table.uuid('recording_id').references('id').inTable('recordings').onDelete('SET NULL');
    table.string('s3_upload_id', 255);
    table.string('s3_bucket', 255);
    table.string('s3_key', 500);
    table.integer('total_parts');
    table.bigInteger('total_bytes_uploaded').defaultTo(0);
    table.jsonb('uploaded_parts');
    table.string('mime_type', 100);
    table.integer('duration_seconds');
    table.boolean('has_audio');
    table.string('resolution', 50);
    table.integer('frame_rate');
    table.jsonb('browser_info');
    table.string('status', 50).defaultTo('active');
    table.text('error_message');
    table.timestamp('last_activity_at');
    table.timestamp('completed_at');
    table.timestamp('expires_at');
    table.timestamps(true, true);
  });

  // Task Access Tokens (for external contributors)
  await knex.schema.createTable('task_access_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('token', 255).notNullable().unique();
    table.string('email', 255);
    table.uuid('contributor_id').references('id').inTable('external_contributors').onDelete('SET NULL');
    table.timestamp('expires_at');
    table.integer('max_uses');
    table.integer('current_uses').defaultTo(0);
    table.timestamp('last_used_at');
    table.boolean('is_revoked').defaultTo(false);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamps(true, true);
  });

  // Task Access Logs
  await knex.schema.createTable('task_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('token_id').references('id').inTable('task_access_tokens').onDelete('CASCADE');
    table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('contributor_id').references('id').inTable('external_contributors').onDelete('SET NULL');
    table.string('action', 50);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================
  // SECTION 5: REVIEW & NOTIFICATION TABLES
  // ============================================================
  console.log('  → Creating review & notification tables...');

  // Reviews
  await knex.schema.createTable('reviews', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('recording_id').references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('reviewer_id').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('reviewee_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('status', 50).defaultTo('pending');
    table.string('decision', 50);
    table.decimal('score', 5, 2);
    table.text('summary');
    table.text('strengths');
    table.text('improvements');
    table.text('knowledge_gaps');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('review_duration_seconds');
    table.jsonb('evaluation_results');
    table.boolean('meets_requirements');
    table.boolean('requires_resubmission');
    table.timestamps(true, true);
  });

  // Review Comments
  await knex.schema.createTable('review_comments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('review_id').notNullable().references('id').inTable('reviews').onDelete('CASCADE');
    table.uuid('author_id').references('id').inTable('users').onDelete('SET NULL');
    table.text('comment');
    table.integer('timestamp_seconds');
    table.integer('duration_seconds');
    table.string('type', 50).defaultTo('general');
    table.jsonb('annotation');
    table.boolean('is_resolved').defaultTo(false);
    table.uuid('resolved_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('resolved_at');
    table.uuid('parent_comment_id').references('id').inTable('review_comments').onDelete('CASCADE');
    table.timestamps(true, true);
  });

  // Notifications
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('type', 100).notNullable();
    table.string('title', 255);
    table.text('message');
    table.string('entity_type', 100);
    table.uuid('entity_id');
    table.boolean('in_app').defaultTo(true);
    table.boolean('email_sent').defaultTo(false);
    table.boolean('slack_sent').defaultTo(false);
    table.boolean('is_read').defaultTo(false);
    table.timestamp('read_at');
    table.string('priority', 20).defaultTo('medium');
    table.string('action_url', 500);
    table.jsonb('metadata');
    table.uuid('triggered_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('expires_at');
    table.timestamps(true, true);
  });

  // Notification Preferences
  await knex.schema.createTable('notification_preferences', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    table.boolean('email_enabled').defaultTo(true);
    table.boolean('push_enabled').defaultTo(true);
    table.boolean('in_app_enabled').defaultTo(true);
    table.string('digest_frequency', 50).defaultTo('immediate');
    table.jsonb('preferences_json');
    table.time('quiet_hours_start');
    table.time('quiet_hours_end');
    table.string('timezone', 100);
    table.timestamp('last_digest_sent_at');
    table.timestamp('last_email_sent_at');
    table.timestamps(true, true);
  });

  // Activity Logs
  await knex.schema.createTable('activity_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100);
    table.string('entity_type', 100);
    table.uuid('entity_id');
    table.jsonb('old_values');
    table.jsonb('new_values');
    table.jsonb('metadata');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('session_id', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================
  // SECTION 6: BILLING & SUBSCRIPTION TABLES
  // ============================================================
  console.log('  → Creating billing & subscription tables...');

  // Pricing Tiers
  await knex.schema.createTable('pricing_tiers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable().unique();
    table.string('display_name', 255);
    table.text('description');
    table.decimal('monthly_price', 10, 2);
    table.decimal('yearly_price', 10, 2);
    table.string('stripe_product_id', 255);
    table.string('stripe_price_id_monthly', 255);
    table.string('stripe_price_id_yearly', 255);
    table.jsonb('limits');
    table.jsonb('features');
    table.boolean('highlighted').defaultTo(false);
    table.string('cta_text', 100);
    table.integer('sort_order').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.boolean('archived').defaultTo(false);
    table.timestamp('archived_at');
    table.uuid('archived_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true);
  });

  // Organization Subscriptions
  await knex.schema.createTable('organization_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().unique().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('tier', 50).notNullable().defaultTo('free');
    table.string('status', 50).defaultTo('active');
    table.string('billing_interval', 20).defaultTo('monthly');
    table.boolean('is_trial').defaultTo(false);
    table.timestamp('trial_start');
    table.timestamp('trial_end');
    table.timestamp('current_period_start');
    table.timestamp('current_period_end');
    table.string('stripe_subscription_id', 255);
    table.string('stripe_customer_id', 255);
    table.string('stripe_price_id', 255);
    table.timestamp('canceled_at');
    table.text('cancellation_reason');
    table.boolean('cancel_at_period_end').defaultTo(false);
    table.boolean('trial_reminder_7d_sent').defaultTo(false);
    table.boolean('trial_reminder_3d_sent').defaultTo(false);
    table.boolean('trial_reminder_1d_sent').defaultTo(false);
    table.boolean('trial_ended_notification_sent').defaultTo(false);
    table.timestamps(true, true);
  });

  // Invoices
  await knex.schema.createTable('invoices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('stripe_invoice_id', 255).unique();
    table.string('stripe_subscription_id', 255);
    table.string('stripe_payment_intent_id', 255);
    table.integer('amount_due');
    table.integer('amount_paid');
    table.integer('amount_remaining');
    table.integer('subtotal');
    table.integer('tax');
    table.integer('total');
    table.string('currency', 10).defaultTo('usd');
    table.string('status', 50);
    table.string('invoice_pdf', 500);
    table.string('hosted_invoice_url', 500);
    table.timestamp('period_start');
    table.timestamp('period_end');
    table.string('number', 100);
    table.text('description');
    table.timestamp('paid_at');
    table.timestamp('due_date');
    table.integer('attempt_count').defaultTo(0);
    table.timestamp('next_payment_attempt');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Payment Methods
  await knex.schema.createTable('payment_methods', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('stripe_payment_method_id', 255).unique();
    table.string('type', 50);
    table.boolean('is_default').defaultTo(false);
    table.string('last_four', 4);
    table.string('brand', 50);
    table.integer('exp_month');
    table.integer('exp_year');
    table.string('funding', 50);
    table.string('bank_name', 255);
    table.string('account_holder_type', 50);
    table.string('billing_name', 255);
    table.string('billing_email', 255);
    table.string('billing_phone', 50);
    table.jsonb('billing_address');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Billing Events
  await knex.schema.createTable('billing_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.string('event_type', 100);
    table.string('stripe_event_id', 255).unique();
    table.string('stripe_subscription_id', 255);
    table.string('stripe_invoice_id', 255);
    table.string('stripe_payment_method_id', 255);
    table.jsonb('event_data');
    table.string('status', 50).defaultTo('pending');
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('processed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Stripe Webhook Events
  await knex.schema.createTable('stripe_webhook_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_id', 255).notNullable().unique();
    table.string('event_type', 100);
    table.timestamp('processed_at');
    table.string('status', 50).defaultTo('pending');
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('completed_at');
  });

  // Checkout Sessions
  await knex.schema.createTable('checkout_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.string('stripe_session_id', 255);
    table.string('url', 1000);
    table.string('status', 50).defaultTo('pending');
    table.timestamp('expires_at');
    table.timestamps(true, true);
  });

  // Organization Feature Grants
  await knex.schema.createTable('organization_feature_grants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('feature_name', 100).notNullable();
    table.timestamp('granted_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.uuid('granted_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('revoked_at');
    table.uuid('revoked_by').references('id').inTable('users').onDelete('SET NULL');
    table.text('reason');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Trial Email Domains
  await knex.schema.createTable('trial_email_domains', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email_domain', 255).notNullable().unique();
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.timestamp('trial_started_at');
    table.timestamp('trial_ended_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Tier Audit Logs
  await knex.schema.createTable('tier_audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('tier_name', 100);
    table.string('action', 50);
    table.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('changes');
    table.jsonb('stripe_details');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================
  // SECTION 7: ANALYSIS & TRANSCRIPTION TABLES
  // ============================================================
  console.log('  → Creating analysis & transcription tables...');

  // Transcription Jobs
  await knex.schema.createTable('transcription_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('status', 50).defaultTo('pending');
    table.string('language', 10);
    table.string('model_used', 100);
    table.integer('progress').defaultTo(0);
    table.string('stage', 100);
    table.text('progress_message');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.float('processing_duration_seconds'); // Float for decimal precision
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    table.jsonb('options');
    table.string('queue_job_id', 255);
    table.timestamps(true, true);
  });

  // Transcription Segments
  await knex.schema.createTable('transcription_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.decimal('start_time', 10, 3);
    table.decimal('end_time', 10, 3);
    table.text('text');
    table.string('speaker', 100);
    table.decimal('confidence', 5, 4);
    table.integer('segment_index');
    table.timestamps(true, true);
  });

  // Analysis Jobs
  await knex.schema.createTable('analysis_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('task_id').references('id').inTable('tasks').onDelete('SET NULL');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('triggered_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('status', 50).defaultTo('pending');
    table.integer('total_frames_extracted').defaultTo(0);
    table.integer('frames_analyzed').defaultTo(0);
    table.boolean('speech_analysis_complete').defaultTo(false);
    table.boolean('visual_analysis_complete').defaultTo(false);
    table.integer('progress').defaultTo(0);
    table.string('stage', 100);
    table.text('progress_message');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.float('processing_duration_seconds'); // Float for decimal precision
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    table.integer('ai_tokens_used').defaultTo(0);
    table.integer('ai_api_calls').defaultTo(0);
    table.decimal('estimated_cost_usd', 10, 4);
    table.string('queue_job_id', 255);
    table.jsonb('config_snapshot');
    table.string('model_used', 100);
    table.string('analysis_version', 50);
    table.timestamps(true, true);
  });

  // Analysis Results
  await knex.schema.createTable('analysis_results', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('analysis_job_id').notNullable().unique().references('id').inTable('analysis_jobs').onDelete('CASCADE');
    table.uuid('recording_id').references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('task_id').references('id').inTable('tasks').onDelete('SET NULL');
    table.decimal('overall_score', 5, 2);
    table.string('overall_verdict', 50);
    table.decimal('overall_confidence', 5, 4);
    table.integer('steps_passed').defaultTo(0);
    table.integer('steps_partial').defaultTo(0);
    table.integer('steps_failed').defaultTo(0);
    table.integer('steps_total').defaultTo(0);
    table.text('summary_text');
    table.jsonb('strengths');
    table.jsonb('improvements');
    table.integer('processing_time_seconds');
    table.timestamps(true, true);
  });

  // Analysis Step Scores
  await knex.schema.createTable('analysis_step_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('analysis_job_id').notNullable().references('id').inTable('analysis_jobs').onDelete('CASCADE');
    table.uuid('rubric_step_id');
    table.integer('step_order');
    table.string('step_title', 255);
    table.string('score', 50);
    table.decimal('confidence', 5, 4);
    table.decimal('weighted_score', 5, 2);
    table.jsonb('speech_evidence');
    table.jsonb('visual_evidence');
    table.text('ai_reasoning');
    table.decimal('detected_at_seconds', 10, 3);
    table.decimal('completed_at_seconds', 10, 3);
    table.timestamps(true, true);
    table.unique(['analysis_job_id', 'rubric_step_id']);
  });

  // Analysis Frames
  await knex.schema.createTable('analysis_frames', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('analysis_job_id').notNullable().references('id').inTable('analysis_jobs').onDelete('CASCADE');
    table.integer('frame_index');
    table.decimal('timestamp_seconds', 10, 3);
    table.string('frame_url', 500);
    table.string('storage_key', 500);
    table.integer('file_size_bytes');
    table.integer('width');
    table.integer('height');
    table.jsonb('analysis_result');
    table.boolean('is_keyframe').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['analysis_job_id', 'frame_index']);
  });

  // Processing Jobs
  await knex.schema.createTable('processing_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.string('job_type', 50);
    table.string('quality', 50);
    table.string('format', 50);
    table.string('status', 50).defaultTo('pending');
    table.integer('progress').defaultTo(0);
    table.string('stage', 100);
    table.text('message');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.float('processing_duration_seconds'); // Float for decimal precision
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.string('queue_job_id', 255);
    table.timestamps(true, true);
  });

  // ============================================================
  // SECTION 8: STORAGE & RETENTION TABLES
  // ============================================================
  console.log('  → Creating storage & retention tables...');

  // Storage Metrics
  await knex.schema.createTable('storage_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().unique().references('id').inTable('organizations').onDelete('CASCADE');
    table.bigInteger('total_bytes_used').defaultTo(0);
    table.bigInteger('bytes_by_recordings').defaultTo(0);
    table.bigInteger('bytes_by_other').defaultTo(0);
    table.bigInteger('max_bytes_allowed');
    table.decimal('percentage_used', 5, 2).defaultTo(0);
    table.integer('recording_count').defaultTo(0);
    table.integer('file_count').defaultTo(0);
    table.timestamp('last_calculated_at');
    table.timestamp('last_cleanup_at');
    table.boolean('usage_exceeded').defaultTo(false);
    table.boolean('alert_sent').defaultTo(false);
    table.timestamp('alert_sent_at');
    table.timestamps(true, true);
  });

  // Recording File Sizes
  await knex.schema.createTable('recording_file_sizes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.bigInteger('file_size_bytes');
    table.string('file_type', 50);
    table.string('storage_provider', 50);
    table.string('storage_path', 500);
    table.jsonb('metadata');
    table.timestamp('deleted_at');
    table.timestamps(true, true);
  });

  // Recording Retention Policies
  await knex.schema.createTable('recording_retention_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description');
    table.integer('retention_days');
    table.string('retention_unit', 50).defaultTo('days');
    table.string('apply_to', 50).defaultTo('all');
    table.jsonb('apply_rules');
    table.string('action_on_expiry', 50).defaultTo('delete');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_default').defaultTo(false);
    table.integer('priority').defaultTo(0);
    table.boolean('auto_enforce').defaultTo(true);
    table.integer('check_interval_days').defaultTo(1);
    table.timestamp('last_enforcement_at');
    table.integer('recordings_affected_count').defaultTo(0);
    table.jsonb('exemption_rules');
    table.timestamps(true, true);
    table.unique(['organization_id', 'name']);
  });

  // Retention Execution Logs
  await knex.schema.createTable('retention_execution_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('policy_id').references('id').inTable('recording_retention_policies').onDelete('SET NULL');
    table.string('action', 50);
    table.string('status', 50).defaultTo('pending');
    table.integer('recordings_processed').defaultTo(0);
    table.integer('recordings_affected').defaultTo(0);
    table.integer('recordings_failed').defaultTo(0);
    table.text('error_message');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('duration_seconds');
    table.uuid('initiated_by').references('id').inTable('users').onDelete('SET NULL');
    table.boolean('is_manual').defaultTo(false);
    table.string('batch_id', 100);
    table.integer('batch_number');
    table.timestamps(true, true);
  });

  // Storage Quota Alerts
  await knex.schema.createTable('storage_quota_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.integer('threshold_percentage');
    table.string('alert_type', 50);
    table.boolean('is_active').defaultTo(true);
    table.boolean('triggered').defaultTo(false);
    table.timestamp('triggered_at');
    table.timestamp('resolved_at');
    table.boolean('notification_sent').defaultTo(false);
    table.timestamp('notification_sent_at');
    table.specificType('notification_channels', 'text[]');
    table.jsonb('actions_taken');
    table.text('action_log');
    table.timestamps(true, true);
  });

  // Organization Buckets
  await knex.schema.createTable('organization_buckets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().unique().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('bucket_name', 63).notNullable().unique();
    table.string('region', 50);
    table.string('status', 50).defaultTo('provisioning');
    table.text('error_message');
    table.jsonb('metadata');
    table.timestamps(true, true);
  });

  // ============================================================
  // SECTION 9: API & SECURITY TABLES
  // ============================================================
  console.log('  → Creating API & security tables...');

  // Refresh Tokens
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 64).notNullable().unique();
    table.uuid('family_id');
    table.uuid('parent_id').references('id').inTable('refresh_tokens').onDelete('SET NULL');
    table.boolean('revoked').defaultTo(false);
    table.timestamp('revoked_at');
    table.string('revoked_reason', 50);
    table.string('device_fingerprint', 255);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('expires_at');
    table.timestamp('last_used_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Admin Impersonation Tokens
  await knex.schema.createTable('admin_impersonation_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('system_admin_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('token', 255).notNullable().unique();
    table.timestamp('expires_at');
    table.timestamp('revoked_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Impersonation Logs
  await knex.schema.createTable('impersonation_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('actor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('target_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('ended_at');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('status', 50).defaultTo('active');
    table.jsonb('metadata');
    table.timestamps(true, true);
  });

  // API Keys
  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 255);
    table.string('key_hash', 64).notNullable().unique();
    table.string('key_prefix', 10);
    table.boolean('is_active').defaultTo(true);
    table.specificType('scopes', 'text[]');
    table.jsonb('rate_limit_override');
    table.timestamp('last_used_at');
    table.integer('usage_count').defaultTo(0);
    table.timestamp('expires_at');
    table.timestamps(true, true);
  });

  // API Metrics
  await knex.schema.createTable('api_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('endpoint', 255);
    table.string('method', 10);
    table.integer('status_code');
    table.integer('response_time_ms');
    table.integer('request_size_bytes');
    table.integer('response_size_bytes');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('error', 255);
    table.text('error_message');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // API Usage Summary
  await knex.schema.createTable('api_usage_summary', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('period', 20);
    table.timestamp('period_start');
    table.timestamp('period_end');
    table.integer('total_requests').defaultTo(0);
    table.integer('successful_requests').defaultTo(0);
    table.integer('failed_requests').defaultTo(0);
    table.bigInteger('total_request_bytes').defaultTo(0);
    table.bigInteger('total_response_bytes').defaultTo(0);
    table.integer('average_response_time_ms');
    table.integer('slowest_response_time_ms');
    table.integer('fastest_response_time_ms');
    table.jsonb('endpoint_breakdown');
    table.timestamp('calculated_at');
    table.timestamp('updated_at');
  });

  // Rate Limit Rules
  await knex.schema.createTable('rate_limit_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.string('tier', 50);
    table.integer('requests_per_minute');
    table.integer('requests_per_hour');
    table.integer('requests_per_day');
    table.integer('burst_limit');
    table.jsonb('endpoint_limits');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // Rate Limit Violations
  await knex.schema.createTable('rate_limit_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('endpoint', 255);
    table.string('violation_type', 50);
    table.integer('limit_exceeded');
    table.integer('current_count');
    table.integer('limit');
    table.string('ip_address', 45);
    table.string('action_taken', 50);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Feature Usage
  await knex.schema.createTable('feature_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('feature_name', 100);
    table.integer('usage_count').defaultTo(0);
    table.jsonb('usage_data');
    table.date('date');
    table.timestamps(true, true);
  });

  // Domain Verification Requests
  await knex.schema.createTable('domain_verification_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('domain', 255).notNullable();
    table.string('verification_method', 50);
    table.string('verification_token', 255).unique();
    table.string('verification_code', 255);
    table.string('verification_email', 255);
    table.string('status', 50).defaultTo('pending');
    table.timestamp('expires_at');
    table.timestamp('verified_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Organization Audit Logs
  await knex.schema.createTable('organization_audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100);
    table.string('resource_type', 100);
    table.uuid('resource_id');
    table.jsonb('changes');
    table.jsonb('metadata');
    table.string('status', 50).defaultTo('success');
    table.text('error_message');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // System Settings
  await knex.schema.createTable('system_settings', (table) => {
    table.string('key', 100).primary();
    table.jsonb('value');
    table.text('description');
    table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================
  // SECTION 10: INDEXES
  // ============================================================
  console.log('  → Creating indexes...');

  // Organizations indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
    CREATE INDEX IF NOT EXISTS idx_organizations_subscription_tier ON organizations(subscription_tier);
    CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);
    CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);
    CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);
  `);

  // Users indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_users_is_system_admin ON users(is_system_admin);
  `);

  // Organization Members indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_status ON organization_members(status);
    CREATE INDEX IF NOT EXISTS idx_org_members_org_status ON organization_members(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_org_members_org_role ON organization_members(organization_id, role);
  `);

  // Organization Invitations indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON organization_invitations(organization_id);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON organization_invitations(invitation_token);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON organization_invitations(status);
  `);

  // Tasks indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_org_status ON tasks(organization_id, status);
  `);

  // Recordings indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_organization_id ON recordings(organization_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_task_id ON recordings(task_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
    CREATE INDEX IF NOT EXISTS idx_recordings_org_status ON recordings(organization_id, status);
  `);

  // Notifications indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON notifications(organization_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
  `);

  // Audit logs indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON organization_audit_logs(organization_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON organization_audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON organization_audit_logs(organization_id, created_at);
  `);

  // Refresh tokens indexes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_revoked ON refresh_tokens(user_id, revoked);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
  `);

  // ============================================================
  // SECTION 11: RLS POLICIES
  // ============================================================
  console.log('  → Enabling Row Level Security...');

  // Enable RLS on multi-tenant tables (only those with organization_id column)
  // Note: analysis_results, analysis_step_scores, analysis_frames are protected
  // indirectly through their parent analysis_jobs table via foreign key
  const rlsTables = [
    'organization_members',
    'organization_invitations',
    'tasks',
    'recordings',
    'reviews',
    'notifications',
    'activity_logs',
    'transcription_jobs',
    'analysis_jobs',
    // analysis_results, analysis_step_scores, analysis_frames - no org_id column
    'upload_sessions',
    'task_access_tokens',
    'task_access_logs',
    'external_contributors',
    'organization_audit_logs',
    'admin_impersonation_tokens',
    'domain_verification_requests',
    'storage_metrics',
    'recording_file_sizes',
    'api_keys',
  ];

  for (const tableName of rlsTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
    await knex.raw(`
      CREATE POLICY ${tableName}_org_isolation ON ${tableName}
      FOR ALL
      USING (organization_id = get_current_org())
      WITH CHECK (organization_id = get_current_org());
    `);
  }

  // Special RLS policy for task_templates (allow system templates)
  await knex.raw(`ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`
    CREATE POLICY task_templates_org_or_system ON task_templates
    FOR SELECT
    USING (organization_id = get_current_org() OR organization_id IS NULL);
  `);
  await knex.raw(`
    CREATE POLICY task_templates_write ON task_templates
    FOR INSERT
    WITH CHECK (organization_id = get_current_org());
  `);
  await knex.raw(`
    CREATE POLICY task_templates_modify ON task_templates
    FOR UPDATE
    USING (organization_id = get_current_org());
  `);
  await knex.raw(`
    CREATE POLICY task_templates_delete ON task_templates
    FOR DELETE
    USING (organization_id = get_current_org());
  `);

  // ============================================================
  // SECTION 12: FUNCTIONS & TRIGGERS
  // ============================================================
  console.log('  → Creating functions and triggers...');

  // Refresh token cleanup function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
    RETURNS INTEGER AS $$
    DECLARE
      deleted_count INTEGER;
    BEGIN
      DELETE FROM refresh_tokens
      WHERE expires_at < NOW() - INTERVAL '7 days'
         OR (revoked = true AND revoked_at < NOW() - INTERVAL '30 days');
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Token family invalidation function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION invalidate_token_family(p_family_id UUID, p_reason TEXT DEFAULT 'reuse_detected')
    RETURNS INTEGER AS $$
    DECLARE
      updated_count INTEGER;
    BEGIN
      UPDATE refresh_tokens
      SET revoked = true,
          revoked_at = NOW(),
          revoked_reason = p_reason
      WHERE family_id = p_family_id AND revoked = false;
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      RETURN updated_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Public invitation validation function (SECURITY DEFINER for RLS bypass)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token TEXT)
    RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_invitation RECORD;
      v_organization RECORD;
    BEGIN
      SELECT id, organization_id, email, role, status, expires_at
      INTO v_invitation
      FROM organization_invitations
      WHERE invitation_token = p_token;

      IF NOT FOUND THEN
        RETURN json_build_object('valid', false, 'error', 'Invitation not found');
      END IF;

      IF v_invitation.expires_at < NOW() THEN
        RETURN json_build_object('valid', false, 'error', 'Invitation has expired');
      END IF;

      IF v_invitation.status != 'pending' THEN
        RETURN json_build_object('valid', false, 'error', 'Invitation has already been ' || v_invitation.status);
      END IF;

      SELECT id, name INTO v_organization FROM organizations WHERE id = v_invitation.organization_id;

      IF NOT FOUND THEN
        RETURN json_build_object('valid', false, 'error', 'Organization not found');
      END IF;

      RETURN json_build_object(
        'valid', true,
        'invitation', json_build_object('id', v_invitation.id, 'email', v_invitation.email, 'role', v_invitation.role, 'expiresAt', v_invitation.expires_at),
        'organizationId', v_organization.id,
        'organizationName', v_organization.name
      );
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.validate_invitation_token(TEXT) TO PUBLIC;
  `);

  // Public invitation acceptance function (SECURITY DEFINER for RLS bypass)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.accept_invitation_for_user(p_token TEXT, p_user_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_invitation RECORD;
      v_user RECORD;
      v_org RECORD;
      v_existing RECORD;
      v_now TIMESTAMP := NOW();
    BEGIN
      SELECT id, organization_id, email, role, status, expires_at, invited_by, created_at
      INTO v_invitation FROM organization_invitations WHERE invitation_token = p_token;

      IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Invitation not found'); END IF;
      IF v_invitation.status != 'pending' THEN RETURN json_build_object('success', false, 'error', 'Invitation is no longer valid'); END IF;
      IF v_now > v_invitation.expires_at THEN RETURN json_build_object('success', false, 'error', 'Invitation has expired'); END IF;

      SELECT id, email, organization_id INTO v_user FROM users WHERE id = p_user_id;
      IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'User not found'); END IF;
      IF LOWER(v_user.email) != LOWER(v_invitation.email) THEN RETURN json_build_object('success', false, 'error', 'User email does not match invitation'); END IF;

      SELECT user_id INTO v_existing FROM organization_members WHERE user_id = p_user_id AND organization_id = v_invitation.organization_id;
      IF FOUND THEN RETURN json_build_object('success', false, 'error', 'User is already a member'); END IF;

      SELECT id, name INTO v_org FROM organizations WHERE id = v_invitation.organization_id;

      IF v_user.organization_id IS NULL THEN
        UPDATE users SET organization_id = v_invitation.organization_id, current_organization_id = v_invitation.organization_id,
          org_role = v_invitation.role, org_status = 'active', joined_organization_at = v_now WHERE id = p_user_id;
      ELSE
        UPDATE users SET current_organization_id = v_invitation.organization_id WHERE id = p_user_id;
      END IF;

      INSERT INTO organization_members (user_id, organization_id, role, status, invited_by, invited_at, joined_at, created_at, updated_at)
      VALUES (p_user_id, v_invitation.organization_id, v_invitation.role, 'active', v_invitation.invited_by, v_invitation.created_at, v_now, v_now, v_now);

      UPDATE organization_invitations SET status = 'accepted', accepted_at = v_now, updated_at = v_now WHERE id = v_invitation.id;

      INSERT INTO organization_audit_logs (organization_id, actor_id, action, resource_type, resource_id, metadata, status, created_at)
      VALUES (v_invitation.organization_id, p_user_id, 'MEMBER_JOINED', 'user', p_user_id,
        json_build_object('role', v_invitation.role, 'invitationId', v_invitation.id, 'email', v_user.email)::jsonb, 'success', v_now);

      RETURN json_build_object('success', true, 'organizationId', v_invitation.organization_id, 'organizationName', v_org.name, 'role', v_invitation.role);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.accept_invitation_for_user(TEXT, UUID) TO PUBLIC;
  `);

  console.log('✅ CogVeri baseline schema created successfully!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🗑️ Dropping CogVeri schema...');

  // Drop functions first
  await knex.raw('DROP FUNCTION IF EXISTS public.accept_invitation_for_user(TEXT, UUID);');
  await knex.raw('DROP FUNCTION IF EXISTS public.validate_invitation_token(TEXT);');
  await knex.raw('DROP FUNCTION IF EXISTS invalidate_token_family(UUID, TEXT);');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_expired_refresh_tokens();');
  await knex.raw('DROP FUNCTION IF EXISTS get_current_user_id();');
  await knex.raw('DROP FUNCTION IF EXISTS set_current_user_id(UUID);');
  await knex.raw('DROP FUNCTION IF EXISTS get_current_org();');
  await knex.raw('DROP FUNCTION IF EXISTS set_current_org(UUID);');

  // Drop tables in reverse dependency order
  const tables = [
    'system_settings',
    'organization_audit_logs',
    'domain_verification_requests',
    'feature_usage',
    'rate_limit_violations',
    'rate_limit_rules',
    'api_usage_summary',
    'api_metrics',
    'api_keys',
    'impersonation_logs',
    'admin_impersonation_tokens',
    'refresh_tokens',
    'organization_buckets',
    'storage_quota_alerts',
    'retention_execution_logs',
    'recording_retention_policies',
    'recording_file_sizes',
    'storage_metrics',
    'processing_jobs',
    'analysis_frames',
    'analysis_step_scores',
    'analysis_results',
    'analysis_jobs',
    'transcription_segments',
    'transcription_jobs',
    'tier_audit_logs',
    'trial_email_domains',
    'organization_feature_grants',
    'checkout_sessions',
    'stripe_webhook_events',
    'billing_events',
    'payment_methods',
    'invoices',
    'organization_subscriptions',
    'pricing_tiers',
    'notification_preferences',
    'activity_logs',
    'notifications',
    'review_comments',
    'reviews',
    'task_access_logs',
    'task_access_tokens',
    'upload_sessions',
    'recording_variants',
    'recordings',
    'tasks',
    'external_contributors',
    'task_templates',
    'organization_invitations',
    'organization_members',
    'users',
    'organizations',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }

  console.log('✅ CogVeri schema dropped');
}
