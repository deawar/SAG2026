-- Migration: Add school theme columns
-- Up: 2026-03-13

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS theme_preset  VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS theme_colors  JSONB       DEFAULT NULL;

COMMENT ON COLUMN schools.theme_preset IS
  'CSS preset key: crimson-gold | navy-gold | forest-gold | purple-gold | scarlet-gray | royal-blue | orange-black';

COMMENT ON COLUMN schools.theme_colors IS
  'Custom hex overrides when preset is null: { primary, primaryDark, primaryLight, secondary, secondaryDark, secondaryLight }';
