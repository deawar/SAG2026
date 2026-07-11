-- Moderation fields on portfolio_items
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE'
  CHECK (moderation_status IN ('VISIBLE','REMOVED'));
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- Per-piece comment thread
CREATE TABLE IF NOT EXISTS portfolio_comments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_item_id  UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  author_role        VARCHAR(20) NOT NULL,
  body               TEXT NOT NULL,
  parent_comment_id  UUID REFERENCES portfolio_comments(id) ON DELETE CASCADE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at         TIMESTAMP WITH TIME ZONE,
  deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT portfolio_comment_body_check CHECK (length(trim(body)) BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS idx_portfolio_comments_item   ON portfolio_comments(portfolio_item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_comments_school ON portfolio_comments(school_id);
DROP TRIGGER IF EXISTS portfolio_comments_updated_at ON portfolio_comments;
CREATE TRIGGER portfolio_comments_updated_at BEFORE UPDATE ON portfolio_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Per-user unread tracking
CREATE TABLE IF NOT EXISTS portfolio_comment_reads (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  last_read_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, portfolio_item_id)
);
