/**
 * Backfill Recording Durations
 *
 * Updates duration_seconds for recordings that have 0 or null duration
 * by probing the actual video files using ffprobe.
 *
 * Usage: npx ts-node scripts/backfill-recording-durations.ts
 */

import { db } from '../src/config/database';
import { getS3Client, getS3Bucket } from '../src/config/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getVideoDuration(url: string): Promise<number | null> {
  try {
    // Use ffprobe to get duration
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${url}"`,
      { timeout: 30000 }
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    console.error(`Failed to get duration for ${url}:`, error);
    return null;
  }
}

async function getPlaybackUrl(recording: any): Promise<string | null> {
  const s3Client = getS3Client();
  const bucket = getS3Bucket();

  if (!s3Client || !bucket || !recording.storage_key) {
    // Try file_url as fallback
    return recording.file_url || null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: recording.storage_key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error(`Failed to get signed URL for ${recording.id}:`, error);
    return recording.file_url || null;
  }
}

async function backfillDurations() {
  console.log('Starting duration backfill...\n');

  // Find recordings with 0 or null duration
  const recordings = await db('recordings')
    .whereNull('duration_seconds')
    .orWhere('duration_seconds', 0)
    .whereIn('status', ['completed', 'processing'])
    .select('id', 'storage_key', 'file_url', 'duration_seconds', 'created_at');

  console.log(`Found ${recordings.length} recordings with missing duration\n`);

  let updated = 0;
  let failed = 0;

  for (const recording of recordings) {
    console.log(`Processing ${recording.id}...`);

    const url = await getPlaybackUrl(recording);
    if (!url) {
      console.log(`  ❌ No URL available, skipping`);
      failed++;
      continue;
    }

    const duration = await getVideoDuration(url);
    if (duration === null || duration <= 0) {
      console.log(`  ❌ Could not determine duration`);
      failed++;
      continue;
    }

    await db('recordings')
      .where('id', recording.id)
      .update({
        duration_seconds: duration,
        updated_at: new Date(),
      });

    console.log(`  ✅ Updated duration to ${duration}s`);
    updated++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total processed: ${recordings.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);

  await db.destroy();
}

backfillDurations().catch(console.error);
