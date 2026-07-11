DROP TABLE IF EXISTS portfolio_comment_reads;
DROP TABLE IF EXISTS portfolio_comments;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderation_reason;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderated_at;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderated_by_user_id;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderation_status;
