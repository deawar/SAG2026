DROP INDEX IF EXISTS idx_artwork_portfolio_item;
ALTER TABLE artwork DROP COLUMN IF EXISTS portfolio_item_id;
DROP INDEX IF EXISTS idx_portfolio_items_school;
DROP INDEX IF EXISTS idx_portfolio_items_student;
DROP TABLE IF EXISTS portfolio_items;
