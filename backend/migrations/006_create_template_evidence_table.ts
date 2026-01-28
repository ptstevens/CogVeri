import { Knex } from 'knex';

/**
 * Migration: Create Template Evidence Table
 *
 * Creates a table to store ground truth evidence extracted from template videos.
 * This enables direct comparison between template and submission videos, rather
 * than relying solely on abstract rubric criteria.
 *
 * For each rubric step, we store:
 * - Speech evidence: verbatim transcript excerpts with timestamps
 * - Visual evidence: reference frame URLs with timestamps and hashes
 *
 * This addresses the "two-layer AI abstraction" problem where:
 * 1. Template video -> AI generates abstract criteria
 * 2. Submission video -> AI re-interprets against abstract criteria
 *
 * With ground truth evidence, we can do direct similarity comparison.
 */

export async function up(knex: Knex): Promise<void> {
  console.log('  Creating template_evidence table...');

  await knex.schema.createTable('template_evidence', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // template_id is nullable during rubric generation, filled in when template is created
    table.uuid('template_id').references('id').inTable('task_templates').onDelete('CASCADE');
    // temp_video_id links evidence to rubric generation before template is created
    table.string('temp_video_id', 100);
    table.string('rubric_step_id', 50).notNullable(); // Matches rubric step IDs like "step-1"

    // Speech evidence (verbatim transcript excerpts)
    table.text('speech_excerpt'); // The actual words spoken in the template
    table.decimal('speech_start_time', 10, 3); // Start timestamp in seconds
    table.decimal('speech_end_time', 10, 3); // End timestamp in seconds

    // Visual evidence (reference frames)
    table.text('visual_frame_url'); // S3 URL of the reference frame
    table.string('visual_frame_hash', 64); // SHA-256 hash for comparison
    table.decimal('visual_frame_timestamp', 10, 3); // Timestamp of the frame

    // Metadata
    table.decimal('confidence', 5, 4); // AI confidence in evidence extraction (0.0-1.0)
    table.jsonb('extraction_metadata'); // Additional extraction details

    table.timestamps(true, true);
  });

  // Index for fast lookups by template
  await knex.raw(`
    CREATE INDEX idx_template_evidence_template_id
    ON template_evidence(template_id)
    WHERE template_id IS NOT NULL
  `);

  // Index for lookups by temp_video_id (during rubric generation)
  await knex.raw(`
    CREATE INDEX idx_template_evidence_temp_video_id
    ON template_evidence(temp_video_id)
    WHERE temp_video_id IS NOT NULL
  `);

  // Unique constraint: one evidence per step per template OR temp_video
  await knex.raw(`
    CREATE UNIQUE INDEX idx_template_evidence_step_unique
    ON template_evidence(COALESCE(template_id::text, temp_video_id), rubric_step_id)
  `);

  console.log('  template_evidence table created successfully.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('  Dropping template_evidence table...');
  await knex.schema.dropTableIfExists('template_evidence');
  console.log('  template_evidence table dropped successfully.');
}
