-- migration_83_organizer_verification_submissions_rollback.sql
-- Removes the organizer_verification_submissions table, trigger, and function.

BEGIN;

DROP TRIGGER IF EXISTS trg_prevent_submission_self_approval ON organizer_verification_submissions;
DROP FUNCTION IF EXISTS prevent_submission_self_approval();
DROP TABLE IF EXISTS organizer_verification_submissions;

COMMIT;

NOTIFY pgrst, 'reload schema';
