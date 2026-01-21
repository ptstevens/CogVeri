#!/usr/bin/env ts-node
/**
 * Migration Script: Migrate Organizations to Dedicated Buckets
 *
 * This script provisions dedicated R2 buckets for existing organizations
 * and optionally migrates their recording data from the shared bucket.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-to-org-buckets.ts [options]
 *
 * Options:
 *   --dry-run          Show what would be done without making changes
 *   --provision-only   Only provision buckets, don't migrate data
 *   --org <id>         Migrate a specific organization only
 *   --copy-data        Copy recordings to new buckets (default: false)
 *
 * Environment:
 *   Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for bucket provisioning.
 */

import dotenv from 'dotenv';
dotenv.config();

import { db } from '../config/database';
import { bucketService } from '../services/bucket.service';
import { logger } from '../utils/logger';

interface MigrationOptions {
  dryRun: boolean;
  provisionOnly: boolean;
  copyData: boolean;
  organizationId?: string;
}

interface MigrationResult {
  organizationId: string;
  organizationName: string;
  bucketProvisioned: boolean;
  bucketName?: string;
  dataMigrated: boolean;
  recordingsCopied: number;
  recordingsFailed: number;
  error?: string;
}

async function parseArgs(): Promise<MigrationOptions> {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: false,
    provisionOnly: false,
    copyData: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--provision-only':
        options.provisionOnly = true;
        break;
      case '--copy-data':
        options.copyData = true;
        break;
      case '--org':
        options.organizationId = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Migration Script: Migrate Organizations to Dedicated Buckets

Usage:
  npx ts-node src/scripts/migrate-to-org-buckets.ts [options]

Options:
  --dry-run          Show what would be done without making changes
  --provision-only   Only provision buckets, don't migrate data
  --org <id>         Migrate a specific organization only
  --copy-data        Copy recordings to new buckets (default: false)
  --help             Show this help message

Examples:
  # Preview what would happen
  npx ts-node src/scripts/migrate-to-org-buckets.ts --dry-run

  # Provision buckets for all organizations
  npx ts-node src/scripts/migrate-to-org-buckets.ts --provision-only

  # Migrate specific organization with data copy
  npx ts-node src/scripts/migrate-to-org-buckets.ts --org abc123 --copy-data

Environment:
  CLOUDFLARE_ACCOUNT_ID    Required for bucket provisioning
  CLOUDFLARE_API_TOKEN     Required for bucket provisioning
  BUCKET_NAME_PREFIX       Prefix for bucket names (default: cogveri)
`);
}

async function migrateOrganization(
  org: { id: string; name: string },
  options: MigrationOptions
): Promise<MigrationResult> {
  const result: MigrationResult = {
    organizationId: org.id,
    organizationName: org.name,
    bucketProvisioned: false,
    dataMigrated: false,
    recordingsCopied: 0,
    recordingsFailed: 0,
  };

  try {
    // Check if org already has a bucket
    const existingBucket = await bucketService.getOrganizationBucket(org.id);
    if (existingBucket?.status === 'active') {
      logger.info(`Organization ${org.name} already has active bucket: ${existingBucket.bucket_name}`);
      result.bucketProvisioned = true;
      result.bucketName = existingBucket.bucket_name;
    } else {
      // Provision new bucket
      if (options.dryRun) {
        const bucketName = bucketService.generateBucketName(org.id);
        logger.info(`[DRY RUN] Would provision bucket: ${bucketName} for ${org.name}`);
        result.bucketName = bucketName;
      } else {
        const provisionResult = await bucketService.provisionBucket(org.id);
        result.bucketProvisioned = provisionResult.status === 'active';
        result.bucketName = provisionResult.bucketName;

        if (!result.bucketProvisioned) {
          result.error = provisionResult.error;
          return result;
        }
        logger.info(`Provisioned bucket: ${provisionResult.bucketName} for ${org.name}`);
      }
    }

    // Migrate data if requested
    if (!options.provisionOnly && options.copyData) {
      if (options.dryRun) {
        // Count recordings that would be migrated
        const recordingCount = await db('recordings')
          .where('organization_id', org.id)
          .whereNotNull('storage_key')
          .count('id as count')
          .first();

        const count = Number(recordingCount?.count || 0);
        logger.info(`[DRY RUN] Would migrate ${count} recordings for ${org.name}`);
        result.recordingsCopied = count;
      } else {
        const migrationResult = await bucketService.migrateOrganizationData(org.id);
        result.dataMigrated = true;
        result.recordingsCopied = migrationResult.copied;
        result.recordingsFailed = migrationResult.failed;

        if (migrationResult.failed > 0) {
          result.error = `${migrationResult.failed} recordings failed to migrate`;
        }

        logger.info(`Migrated ${migrationResult.copied} recordings for ${org.name}`);
      }
    }

    return result;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to migrate organization ${org.name}:`, error);
    return result;
  }
}

async function main(): Promise<void> {
  const options = await parseArgs();

  logger.info('Starting organization bucket migration', {
    dryRun: options.dryRun,
    provisionOnly: options.provisionOnly,
    copyData: options.copyData,
    organizationId: options.organizationId,
  });

  // Validate environment
  if (!options.dryRun) {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      logger.warn('Cloudflare API credentials not configured. Using S3 CreateBucket fallback.');
    }
  }

  // Get organizations to migrate
  let query = db('organizations')
    .where('is_active', true)
    .select('id', 'name');

  if (options.organizationId) {
    query = query.where('id', options.organizationId);
  }

  const organizations = await query;

  if (organizations.length === 0) {
    logger.info('No organizations found to migrate');
    process.exit(0);
  }

  logger.info(`Found ${organizations.length} organization(s) to process`);

  const results: MigrationResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const org of organizations) {
    logger.info(`Processing organization: ${org.name} (${org.id})`);
    const result = await migrateOrganization(org, options);
    results.push(result);

    if (result.bucketProvisioned && !result.error) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  // Print summary
  console.log('\n=== Migration Summary ===');
  console.log(`Total organizations: ${organizations.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failureCount}`);

  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes were made.');
  }

  console.log('\n=== Detailed Results ===');
  for (const result of results) {
    const status = result.bucketProvisioned && !result.error ? 'SUCCESS' : 'FAILED';
    console.log(`\n${status}: ${result.organizationName} (${result.organizationId})`);
    if (result.bucketName) {
      console.log(`  Bucket: ${result.bucketName}`);
    }
    if (result.recordingsCopied > 0 || result.recordingsFailed > 0) {
      console.log(`  Recordings copied: ${result.recordingsCopied}`);
      console.log(`  Recordings failed: ${result.recordingsFailed}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  // Exit with appropriate code
  process.exit(failureCount > 0 ? 1 : 0);
}

// Run the migration
main().catch((error) => {
  logger.error('Migration script failed:', error);
  process.exit(1);
});
