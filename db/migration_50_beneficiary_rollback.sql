-- migration_50_beneficiary_rollback.sql
-- Reverses migration_50_beneficiary.sql.
--
-- Destructive: dropping `beneficiary` permanently discards every recorded
-- beneficiary (who each fundraiser is helping, relationships, species,
-- charity registration numbers). Legacy rows are reconstructible from the
-- organizer, but anything captured through the create/edit flow after the
-- migration is not. Export first if that data matters.
--
-- The generated columns are dropped explicitly and before their source, since
-- they depend on `beneficiary`.

DROP INDEX IF EXISTS fundraisers_beneficiary_type_idx;

ALTER TABLE fundraisers
  DROP COLUMN IF EXISTS beneficiary_type,
  DROP COLUMN IF EXISTS beneficiary_name;

ALTER TABLE fundraisers
  DROP CONSTRAINT IF EXISTS fundraisers_beneficiary_valid;

ALTER TABLE fundraisers
  DROP COLUMN IF EXISTS beneficiary;

NOTIFY pgrst, 'reload schema';
