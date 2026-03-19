-- Add theme columns to schools table
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(50),
  ADD COLUMN IF NOT EXISTS theme_colors JSONB;
