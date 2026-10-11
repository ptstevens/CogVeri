/**
 * Script to queue MP4 transcoding for existing recordings that don't have transcoded variants.
 *
 * Usage:
 *   npx ts-node scripts/transcode-existing-recordings.ts [--dry-run] [--limit=N]
 *
 * Options:
 *   --dry-run    Show what would be queued without actually queuing
 *   --limit=N    Limit to N recordings (default: all)
 */

import { db } from '../src/config/database';
import { transcodeQueueHelpers, TranscodeQuality } from '../src/queues';
import { logger } from '../src/utils/logger';

interface Recording {
  id: string;
  file_url: string;
  organization_id: string;
  status: string;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

  console.log('=== Transcode Existing Recordings ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} recordings`);
  console.log('');

  try {
    // Find completed recordings without MP4 variants
    let query = db('recordings')
      .select(
        'recordings.id',
        'recordings.file_url',
        'recordings.organization_id',
        'recordings.status'
      )
      .leftJoin('recording_variants', function () {
        this.on('recordings.id', '=', 'recording_variants.recording_id').andOn(
          'recording_variants.format',
          '=',
          db.raw("'mp4'")
        );
      })
      .where('recordings.status', 'completed')
      .whereNotNull('recordings.file_url')
      .whereNull('recording_variants.id')
      .orderBy('recordings.created_at', 'desc');

    if (limit) {
      query = query.limit(limit);
    }

    const recordings: Recording[] = await query;

    console.log(`Found ${recordings.length} recordings without MP4 variants`);
    console.log('');

    if (recordings.length === 0) {
      console.log('Nothing to do!');
      process.exit(0);
    }

    let queued = 0;
    let failed = 0;

    for (const recording of recordings) {
      console.log(`[${queued + failed + 1}/${recordings.length}] Recording: ${recording.id}`);

      if (dryRun) {
        console.log(`  Would queue: MP4 transcode (medium quality)`);
        console.log(`  File URL: ${recording.file_url?.substring(0, 50)}...`);
        queued++;
      } else {
        try {
          await transcodeQueueHelpers.queueTranscode({
            recordingId: recording.id,
            inputFileUrl: recording.file_url,
            organizationId: recording.organization_id,
            quality: TranscodeQuality.MEDIUM,
            outputFormat: 'mp4',
          });
          console.log(`  ✓ Queued successfully`);
          queued++;
        } catch (error) {
          console.error(`  ✗ Failed to queue:`, error);
          failed++;
        }
      }
    }

    console.log('');
    console.log('=== Summary ===');
    console.log(`Total recordings: ${recordings.length}`);
    console.log(`Queued: ${queued}`);
    console.log(`Failed: ${failed}`);

    if (dryRun) {
      console.log('');
      console.log('This was a dry run. Run without --dry-run to actually queue transcoding.');
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
