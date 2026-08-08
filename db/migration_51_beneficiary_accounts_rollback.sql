-- migration_51_beneficiary_accounts_rollback.sql
-- Reverses migration_51_beneficiary_accounts.sql.
--
-- Safe by design: migration_50's `fundraisers.beneficiary` JSONB was left in
-- place and still holds the identity data, so dropping this table does not
-- lose who each fundraiser helps.
--
-- Destructive for account data specifically: any claimed account links
-- (user_id), beneficiary-authored profile content (photo, bio, contact and
-- social links) and verification state exist ONLY here and are permanently
-- lost. Export beneficiaries before running this if any have been claimed.

DROP INDEX IF EXISTS fundraisers_beneficiary_id_idx;

ALTER TABLE fundraisers
  DROP COLUMN IF EXISTS beneficiary_id;

DROP TABLE IF EXISTS beneficiaries;

NOTIFY pgrst, 'reload schema';
