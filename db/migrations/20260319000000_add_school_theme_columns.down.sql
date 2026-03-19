-- Remove theme columns from schools table
ALTER TABLE schools
  DROP COLUMN IF EXISTS theme_preset,
  DROP COLUMN IF EXISTS theme_colors;
