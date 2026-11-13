-- Migration 205: Internal staff notes on table reservations.
--
-- Adds reservations.internal_note (nullable text, max 1000 chars) for staff-only
-- operational notes (e.g., seating preferences, guest VIP tags, phone notes).
-- Guests never see this column (omitted from public site queries and notifications).
-- No changes to existing columns or RPCs.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS internal_note text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_internal_note_len_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_internal_note_len_check
      CHECK (internal_note IS NULL OR length(internal_note) <= 1000);
  END IF;
END $$;
