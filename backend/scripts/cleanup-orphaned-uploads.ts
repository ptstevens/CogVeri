#!/usr/bin/env ts-node
/**
 * Cleanup Orphaned R2/S3 Multipart Uploads
 *
 * This script finds and aborts all incomplete multipart uploads in R2/S3,
 * and updates corresponding database records.
 *
 * Usage:
 *   npx ts-node scripts/cleanup-orphaned-uploads.ts [options]
 *
 * Options:
 *   --dry-run       List uploads without aborting them
 *   --older-than=X  Only cleanup uploads older than X hours (default: 1)
 *   --help          Show this help message
 *
 * Examples:
 *   npm run cleanup:uploads                    # Cleanup all orphaned uploads older than 1 hour
 *   npm run cleanup:uploads -- --dry-run       # Preview what would be cleaned
 *   npm run cleanup:uploads -- --older-than=4  # Only cleanup uploads older than 4 hours
 */

import {
  S3Client,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import knex from 'knex';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// =====================
// Configuration
// =====================

interface ScriptOptions {
  dryRun: boolean;
  olderThanHours: number;
  showHelp: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);

  const options: ScriptOptions = {
    dryRun: false,
    olderThanHours: 1,
    showHelp: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--older-than=')) {
      options.olderThanHours = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help') {
      options.showHelp = true;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Cleanup Orphaned R2/S3 Multipart Uploads

Usage:
  npx ts-node scripts/cleanup-orphaned-uploads.ts [options]

Options:
  --dry-run       List uploads without aborting them
  --older-than=X  Only cleanup uploads older than X hours (default: 1)
  --help          Show this help message

Examples:
  npm run cleanup:uploads                    # Cleanup all orphaned uploads older than 1 hour
  npm run cleanup:uploads -- --dry-run       # Preview what would be cleaned
  npm run cleanup:uploads -- --older-than=4  # Only cleanup uploads older than 4 hours
`);
}

// =====================
// Database Connection
// =====================

function createDbConnection() {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'cogveri',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
  });
}

// =====================
// S3/R2 Client
// =====================

function createS3Client(): S3Client | null {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('Error: AWS credentials not configured');
    console.error('Required env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET');
    return null;
  }

  const s3Config: any = {
    region: process.env.AWS_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };

  // For R2, use the custom endpoint
  if (process.env.AWS_ENDPOINT_URL) {
    s3Config.endpoint = process.env.AWS_ENDPOINT_URL;
    s3Config.forcePathStyle = true; // Required for R2
  }

  return new S3Client(s3Config);
}

// =====================
// Main Cleanup Logic
// =====================

interface MultipartUpload {
  key: string;
  uploadId: string;
  initiated: Date;
  ageHours: number;
}

async function listMultipartUploads(
  s3Client: S3Client,
  bucket: string
): Promise<MultipartUpload[]> {
  const uploads: MultipartUpload[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;

  while (true) {
    const command = new ListMultipartUploadsCommand({
      Bucket: bucket,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
    });

    const response = await s3Client.send(command);

    if (response.Uploads) {
      for (const upload of response.Uploads) {
        if (upload.Key && upload.UploadId && upload.Initiated) {
          const ageMs = Date.now() - upload.Initiated.getTime();
          const ageHours = ageMs / (1000 * 60 * 60);

          uploads.push({
            key: upload.Key,
            uploadId: upload.UploadId,
            initiated: upload.Initiated,
            ageHours,
          });
        }
      }
    }

    if (!response.IsTruncated) {
      break;
    }

    keyMarker = response.NextKeyMarker;
    uploadIdMarker = response.NextUploadIdMarker;
  }

  return uploads;
}

async function abortUpload(
  s3Client: S3Client,
  bucket: string,
  key: string,
  uploadId: string
): Promise<boolean> {
  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    });

    await s3Client.send(command);
    return true;
  } catch (error: any) {
    console.error(`  Failed to abort: ${error.message}`);
    return false;
  }
}

async function updateDatabaseSession(db: knex.Knex, uploadId: string): Promise<boolean> {
  try {
    const result = await db('upload_sessions')
      .where('s3_upload_id', uploadId)
      .whereIn('status', ['active', 'completing'])
      .update({
        status: 'aborted',
        error_message: 'Aborted by cleanup script',
        updated_at: new Date(),
      });

    return result > 0;
  } catch (error: any) {
    console.error(`  DB update failed: ${error.message}`);
    return false;
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }

  console.log('\n🧹 R2/S3 Multipart Upload Cleanup');
  console.log('================================\n');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Initialize S3 client
  const s3Client = createS3Client();
  if (!s3Client) {
    process.exit(1);
  }

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    console.error('Error: AWS_S3_BUCKET not configured');
    process.exit(1);
  }

  console.log(`Bucket: ${bucket}`);
  console.log(`Cleanup uploads older than: ${options.olderThanHours} hour(s)\n`);

  // Initialize database
  const db = createDbConnection();

  try {
    // List all multipart uploads
    console.log('Fetching ongoing multipart uploads...\n');
    const uploads = await listMultipartUploads(s3Client, bucket);

    if (uploads.length === 0) {
      console.log('✅ No ongoing multipart uploads found!');
      await db.destroy();
      process.exit(0);
    }

    console.log(`Found ${uploads.length} ongoing multipart upload(s):\n`);

    // Filter by age
    const uploadsToClean = uploads.filter((u) => u.ageHours >= options.olderThanHours);

    const uploadsToKeep = uploads.filter((u) => u.ageHours < options.olderThanHours);

    if (uploadsToKeep.length > 0) {
      console.log(`📋 Recent uploads (will be kept):`);
      for (const upload of uploadsToKeep) {
        console.log(`  - ${upload.key}`);
        console.log(`    Age: ${upload.ageHours.toFixed(1)} hours`);
        console.log(`    Upload ID: ${upload.uploadId.substring(0, 20)}...`);
      }
      console.log('');
    }

    if (uploadsToClean.length === 0) {
      console.log(`✅ No uploads older than ${options.olderThanHours} hour(s) to clean up!`);
      await db.destroy();
      process.exit(0);
    }

    console.log(`🗑️  Uploads to clean (older than ${options.olderThanHours} hour(s)):`);
    for (const upload of uploadsToClean) {
      console.log(`  - ${upload.key}`);
      console.log(`    Age: ${upload.ageHours.toFixed(1)} hours`);
      console.log(`    Started: ${upload.initiated.toISOString()}`);
    }
    console.log('');

    if (options.dryRun) {
      console.log(`\n🔍 DRY RUN: Would abort ${uploadsToClean.length} upload(s)`);
      await db.destroy();
      process.exit(0);
    }

    // Abort uploads
    console.log('Aborting uploads...\n');
    let abortedCount = 0;
    let dbUpdatedCount = 0;

    for (const upload of uploadsToClean) {
      console.log(`Processing: ${upload.key}`);

      const aborted = await abortUpload(s3Client, bucket, upload.key, upload.uploadId);
      if (aborted) {
        abortedCount++;
        console.log('  ✅ Aborted in R2');
      }

      const dbUpdated = await updateDatabaseSession(db, upload.uploadId);
      if (dbUpdated) {
        dbUpdatedCount++;
        console.log('  ✅ Database record updated');
      } else {
        console.log('  ℹ️  No matching database record (may have been created before tracking)');
      }

      console.log('');
    }

    // Summary
    console.log('================================');
    console.log('📊 Cleanup Summary:');
    console.log(`   Total uploads found: ${uploads.length}`);
    console.log(`   Uploads cleaned: ${abortedCount}`);
    console.log(`   Database records updated: ${dbUpdatedCount}`);
    console.log('================================\n');

    console.log('✅ Cleanup complete!');
  } catch (error: any) {
    console.error('Error during cleanup:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run
main();
