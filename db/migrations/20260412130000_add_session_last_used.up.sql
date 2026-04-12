-- Add last_used_at column to user_sessions for session management UI
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;
