-- Live Sessions table for WebRTC functionality
CREATE TABLE IF NOT EXISTS live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended', 'cancelled')),

  -- Session metadata
  title VARCHAR(255),
  description TEXT,
  scheduled_start TIMESTAMP WITH TIME ZONE,
  actual_start TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,

  -- Participant tracking
  max_participants INTEGER DEFAULT 10,
  participant_count INTEGER DEFAULT 0,

  -- Recording info
  is_recorded BOOLEAN DEFAULT false,
  recording_id UUID REFERENCES recordings(id),

  -- Session settings
  allow_guests BOOLEAN DEFAULT false,
  require_approval BOOLEAN DEFAULT false,
  enable_chat BOOLEAN DEFAULT true,
  enable_screen_share BOOLEAN DEFAULT true,
  enable_recording BOOLEAN DEFAULT true,

  -- WebRTC configuration
  ice_servers JSONB,
  signaling_data JSONB,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Session participants table
CREATE TABLE IF NOT EXISTS session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('host', 'presenter', 'moderator', 'viewer')),

  -- Participant status
  status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('invited', 'waiting', 'joined', 'left', 'disconnected', 'removed')),
  joined_at TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE,

  -- Permissions
  can_share_screen BOOLEAN DEFAULT false,
  can_record BOOLEAN DEFAULT false,
  can_chat BOOLEAN DEFAULT true,
  is_muted BOOLEAN DEFAULT false,
  is_video_off BOOLEAN DEFAULT false,

  -- Connection info
  connection_quality VARCHAR(20),
  browser_info JSONB,
  network_stats JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

-- Session chat messages
CREATE TABLE IF NOT EXISTS session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'file', 'reaction')),

  -- For file messages
  file_url VARCHAR(500),
  file_name VARCHAR(255),
  file_size INTEGER,

  -- Metadata
  is_pinned BOOLEAN DEFAULT false,
  replied_to UUID REFERENCES session_messages(id),
  reactions JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Session events log
CREATE TABLE IF NOT EXISTS session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_live_sessions_task_id ON live_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_host_id ON live_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions(status);
CREATE INDEX IF NOT EXISTS idx_live_sessions_started_at ON live_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user_id ON session_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_session_id ON session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON session_events(timestamp);