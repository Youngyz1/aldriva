-- migration_55_beneficiary_claim_token_grants_rollback.sql
--
-- WARNING: this republishes beneficiary claim tokens to anonymous callers,
-- which allows anyone to claim any unclaimed beneficiary profile. Do not run
-- this unless you are replacing the protection with something equivalent.

BEGIN;

GRANT SELECT ON beneficiaries TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
