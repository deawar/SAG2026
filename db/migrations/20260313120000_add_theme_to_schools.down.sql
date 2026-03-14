-- Migration: Add school theme columns
-- Down: 2026-03-13

ALTER TABLE schools
  DROP COLUMN IF EXISTS theme_preset,
  DROP COLUMN IF EXISTS theme_colors;
