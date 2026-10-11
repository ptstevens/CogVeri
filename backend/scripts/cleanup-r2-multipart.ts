/**
 * R2/S3 Multipart Upload Cleanup Script
 *
 * This script lists and aborts incomplete multipart uploads, and optionally
 * deletes all objects in the bucket.
 *
 * Usage:
 *   npx ts-node scripts/cleanup-r2-multipart.ts [--delete-all] [--dry-run]
 *
 * Options:
 *   --dry-run      Show what would be done without actually doing it
 *   --delete-all   Also delete all objects (not just abort multipart uploads)
 */

import {
  S3Client,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteAll = args.includes('--delete-all');

// Get config from environment
const endpoint = process.env.AWS_ENDPOINT_URL;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const mainBucket = process.env.AWS_S3_BUCKET || 'cogveri-staging';
const rubricBucket = process.env.RUBRIC_TEMP_BUCKET || 'cogveri-rubric-videos-staging';

if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error('Missing AWS/R2 credentials in environment');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});

async function listMultipartUploads(bucket: string): Promise<void> {
  console.log(`\n📦 Listing multipart uploads in: ${bucket}`);

  try {
    const response = await s3Client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
      })
    );

    const uploads = response.Uploads || [];

    if (uploads.length === 0) {
      console.log('  ✓ No incomplete multipart uploads found');
      return;
    }

    console.log(`  Found ${uploads.length} incomplete multipart upload(s):`);

    for (const upload of uploads) {
      console.log(`    - Key: ${upload.Key}`);
      console.log(`      UploadId: ${upload.UploadId}`);
      console.log(`      Initiated: ${upload.Initiated}`);

      if (!dryRun && upload.Key && upload.UploadId) {
        try {
          await s3Client.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: upload.Key,
              UploadId: upload.UploadId,
            })
          );
          console.log(`      ✓ Aborted`);
        } catch (error: any) {
          console.log(`      ✗ Failed to abort: ${error.message}`);
        }
      } else if (dryRun) {
        console.log(`      [DRY RUN] Would abort`);
      }
    }
  } catch (error: any) {
    console.error(`  ✗ Error listing multipart uploads: ${error.message}`);
  }
}

async function listAndDeleteObjects(bucket: string): Promise<void> {
  console.log(`\n📁 Listing objects in: ${bucket}`);

  try {
    let continuationToken: string | undefined;
    let totalObjects = 0;
    let totalSize = 0;

    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      const objects = response.Contents || [];
      totalObjects += objects.length;

      for (const obj of objects) {
        totalSize += obj.Size || 0;
        console.log(`    - ${obj.Key} (${formatBytes(obj.Size || 0)})`);
      }

      if (deleteAll && objects.length > 0 && !dryRun) {
        // Delete in batches of 1000 (S3 limit)
        const deleteParams = {
          Bucket: bucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key! })),
          },
        };

        try {
          await s3Client.send(new DeleteObjectsCommand(deleteParams));
          console.log(`    ✓ Deleted ${objects.length} objects`);
        } catch (error: any) {
          console.log(`    ✗ Failed to delete: ${error.message}`);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`\n  Total: ${totalObjects} objects (${formatBytes(totalSize)})`);

    if (deleteAll && totalObjects > 0) {
      if (dryRun) {
        console.log(`  [DRY RUN] Would delete all ${totalObjects} objects`);
      } else {
        console.log(`  ✓ Deleted all objects`);
      }
    }
  } catch (error: any) {
    console.error(`  ✗ Error: ${error.message}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
  console.log('='.repeat(60));
  console.log('R2/S3 Cleanup Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Delete all objects: ${deleteAll ? 'YES' : 'NO (multipart only)'}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Buckets: ${mainBucket}, ${rubricBucket}`);

  // Process main bucket
  await listMultipartUploads(mainBucket);
  await listAndDeleteObjects(mainBucket);

  // Process rubric bucket
  await listMultipartUploads(rubricBucket);
  await listAndDeleteObjects(rubricBucket);

  console.log('\n' + '='.repeat(60));
  console.log('Cleanup complete!');

  if (dryRun) {
    console.log('\nThis was a DRY RUN. Run without --dry-run to execute.');
  }
}

main().catch(console.error);
