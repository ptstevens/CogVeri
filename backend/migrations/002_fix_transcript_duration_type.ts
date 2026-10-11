import { Knex } from 'knex';

/**
 * Migration: Fix duration columns that should be FLOAT, not INTEGER
 *
 * The baseline schema incorrectly defined several duration columns as INTEGER,
 * but processing times come as floats (e.g., 103.4 seconds, 25.89 seconds).
 * This migration changes these columns to DOUBLE PRECISION to store decimal values.
 *
 * Affected columns:
 * - recordings.transcript_duration_seconds (Whisper returns float duration)
 * - transcription_jobs.processing_duration_seconds (processing time is float)
 * - analysis_jobs.processing_duration_seconds
 * - frame_extraction_jobs.processing_duration_seconds
 */

interface ColumnToFix {
  table: string;
  column: string;
}

const columnsToFix: ColumnToFix[] = [
  { table: 'recordings', column: 'transcript_duration_seconds' },
  { table: 'transcription_jobs', column: 'processing_duration_seconds' },
  { table: 'analysis_jobs', column: 'processing_duration_seconds' },
  { table: 'frame_extraction_jobs', column: 'processing_duration_seconds' },
];

export async function up(knex: Knex): Promise<void> {
  for (const { table, column } of columnsToFix) {
    const hasColumn = await knex.schema.hasColumn(table, column);

    if (hasColumn) {
      console.log(`  Altering ${table}.${column} to DOUBLE PRECISION...`);
      await knex.raw(`
        ALTER TABLE ${table}
        ALTER COLUMN ${column} TYPE DOUBLE PRECISION
        USING ${column}::DOUBLE PRECISION
      `);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { table, column } of columnsToFix) {
    const hasColumn = await knex.schema.hasColumn(table, column);

    if (hasColumn) {
      // Revert to INTEGER (will truncate decimal values)
      await knex.raw(`
        ALTER TABLE ${table}
        ALTER COLUMN ${column} TYPE INTEGER
        USING ROUND(${column})::INTEGER
      `);
    }
  }
}
