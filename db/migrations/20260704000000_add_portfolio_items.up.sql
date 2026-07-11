-- Student portfolio: pieces that live independently of any auction.
CREATE TABLE IF NOT EXISTS portfolio_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  medium               VARCHAR(100),
  artist_grade         VARCHAR(20),
  dimensions_width_cm  DECIMAL(10, 2),
  dimensions_height_cm DECIMAL(10, 2),
  dimensions_depth_cm  DECIMAL(10, 2),
  estimated_value      DECIMAL(10, 2),
  image_url            VARCHAR(2083),
  image_storage_key    VARCHAR(500),
  portfolio_status     VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
                       CHECK (portfolio_status IN ('IN_PROGRESS', 'COMPLETED')),
  submission_state     VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED'
                       CHECK (submission_state IN ('NOT_SUBMITTED','PENDING_REVIEW','IN_AUCTION','SOLD','UNSOLD','REJECTED','WITHDRAWN')),
  rejection_reason     TEXT,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at           TIMESTAMP WITH TIME ZONE,
  CONSTRAINT portfolio_title_check CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_student ON portfolio_items(student_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_items_school  ON portfolio_items(school_id)        WHERE deleted_at IS NULL;

ALTER TABLE artwork ADD COLUMN IF NOT EXISTS portfolio_item_id UUID NULL REFERENCES portfolio_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artwork_portfolio_item ON artwork(portfolio_item_id);
