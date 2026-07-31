-- Migration 06: Add preferences JSONB column to profiles
-- Run in Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.preferences IS
  'User-level notification and display preferences stored as JSON';
