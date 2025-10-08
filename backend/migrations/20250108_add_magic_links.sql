-- Create external_contributors table
CREATE TABLE IF NOT EXISTS external_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  total_tasks_assigned INTEGER DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,
  total_tasks_rejected INTEGER DEFAULT 0,
  average_completion_time_seconds INTEGER,
  last_active_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create task_access_tokens table
CREATE TABLE IF NOT EXISTS task_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  contributor_id UUID REFERENCES external_contributors(id),
  expires_at TIMESTAMP NOT NULL,
  max_uses INTEGER DEFAULT NULL, -- NULL means unlimited within expiry
  current_uses INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create task_access_logs table for analytics
CREATE TABLE IF NOT EXISTS task_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES task_access_tokens(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  contributor_id UUID REFERENCES external_contributors(id),
  action VARCHAR(50) NOT NULL, -- 'viewed', 'claimed', 'started_recording', 'submitted', 'downloaded'
  ip_address VARCHAR(50),
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add new fields to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS access_token_expires_days INTEGER DEFAULT 30;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_external_task BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_contributor_id UUID REFERENCES external_contributors(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS claim_name VARCHAR(255);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS claim_email VARCHAR(255);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_access_tokens_token ON task_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_task_access_tokens_task_id ON task_access_tokens(task_id);
CREATE INDEX IF NOT EXISTS idx_task_access_tokens_email ON task_access_tokens(email);
CREATE INDEX IF NOT EXISTS idx_task_access_tokens_expires_at ON task_access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_external_contributors_email ON external_contributors(email);
CREATE INDEX IF NOT EXISTS idx_task_access_logs_token_id ON task_access_logs(token_id);
CREATE INDEX IF NOT EXISTS idx_task_access_logs_task_id ON task_access_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_access_logs_contributor_id ON task_access_logs(contributor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_external_contributor_id ON tasks(external_contributor_id);

-- Create function to update external_contributor stats
CREATE OR REPLACE FUNCTION update_contributor_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE external_contributors
    SET
      total_tasks_completed = total_tasks_completed + 1,
      last_active_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.external_contributor_id;
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    UPDATE external_contributors
    SET
      total_tasks_rejected = total_tasks_rejected + 1,
      last_active_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.external_contributor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for task status changes
DROP TRIGGER IF EXISTS trigger_update_contributor_stats ON tasks;
CREATE TRIGGER trigger_update_contributor_stats
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.external_contributor_id IS NOT NULL)
  EXECUTE FUNCTION update_contributor_stats();

COMMENT ON TABLE external_contributors IS 'Stores information about external contributors who access tasks via magic links';
COMMENT ON TABLE task_access_tokens IS 'Secure tokens for passwordless task access';
COMMENT ON TABLE task_access_logs IS 'Analytics and audit trail for external task access';
