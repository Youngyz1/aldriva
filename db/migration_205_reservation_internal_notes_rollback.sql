-- Migration 205 Rollback: Fail-closed guard for reservations.internal_note.
--
-- Fails closed if any reservation contains a non-null internal_note to protect operational data.
-- Otherwise drops the check constraint and column.

DO $$
DECLARE
  v_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservations'
      AND column_name = 'internal_note'
  ) THEN
    SELECT count(*) INTO v_count
    FROM public.reservations
    WHERE internal_note IS NOT NULL;

    IF v_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION_205_ROLLBACK_BLOCKED: % reservation(s) contain an internal_note. Back up or clear the notes before dropping the column.', v_count;
    END IF;

    ALTER TABLE public.reservations
      DROP CONSTRAINT IF EXISTS reservations_internal_note_len_check;

    ALTER TABLE public.reservations
      DROP COLUMN IF EXISTS internal_note;
  END IF;
END $$;
