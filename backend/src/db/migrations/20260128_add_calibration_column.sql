-- Add is_calibration column to analysis_jobs for tracking calibration runs
-- Calibration runs analyze template videos against their own rubrics to ensure accuracy

ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS is_calibration BOOLEAN DEFAULT FALSE;

-- Index for filtering calibration jobs
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_is_calibration ON analysis_jobs(is_calibration) WHERE is_calibration = TRUE;

COMMENT ON COLUMN analysis_jobs.is_calibration IS 'True if this analysis is a calibration run (template video against its own rubric)';
