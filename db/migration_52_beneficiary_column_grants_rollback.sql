-- migration_52_beneficiary_column_grants_rollback.sql
-- Restores table-wide UPDATE for `authenticated` on beneficiaries.
--
-- WARNING: this reopens the privilege-escalation gap migration_52 closed —
-- a beneficiary who has claimed their profile regains the ability to write
-- verified_at (self-verification) and to rewrite their own name/type. Only
-- run this if you are replacing the protection with something equivalent.

GRANT UPDATE ON beneficiaries TO authenticated;

NOTIFY pgrst, 'reload schema';
