-- migration_56_beneficiary_public_profile_rollback.sql
--
-- WARNING: dropping `slug` breaks every public beneficiary profile URL that has
-- been shared. Re-running migration_56 afterwards regenerates DIFFERENT random
-- suffixes, so those links do not come back. Only run this if the public
-- profile feature is being withdrawn entirely.

BEGIN;

-- 56.4 rollback — removes the beneficiary's read access to their campaign.
DROP POLICY IF EXISTS "Beneficiaries can read their own campaign" ON fundraisers;

-- 56.2 rollback
DROP TRIGGER IF EXISTS trg_set_beneficiary_slug ON beneficiaries;
DROP FUNCTION IF EXISTS set_beneficiary_slug();

-- 56.1 / 56.3 rollback — the column grant goes with the column.
DROP INDEX IF EXISTS idx_beneficiaries_slug;
ALTER TABLE beneficiaries DROP COLUMN IF EXISTS slug;
DROP FUNCTION IF EXISTS beneficiary_slugify(text, uuid);

COMMIT;

NOTIFY pgrst, 'reload schema';
