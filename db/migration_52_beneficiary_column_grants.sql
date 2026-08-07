-- migration_52_beneficiary_column_grants.sql
-- Closes a privilege-escalation gap left by migration_51.
--
-- Row-level security decides WHICH ROWS a user may touch, not which columns.
-- migration_51's UPDATE policy correctly limits a beneficiary to their own
-- row — but within that row they could write any column, including:
--
--   verified_at  -> award themselves a verification badge
--   name / type  -> change who the campaign appears to be raising for
--   user_id      -> (blocked by WITH CHECK, but only incidentally)
--
-- Column-level GRANTs are the right mechanism. RLS then narrows to the row,
-- and the grant narrows to the editable fields, so both must pass.
--
-- Note this governs the `authenticated` role only. Server-side code using the
-- service-role key is unaffected and still administers verification, identity
-- and the claim flow — which is where those changes belong.

REVOKE UPDATE ON beneficiaries FROM authenticated;

-- Exactly the profile fields a beneficiary owns: how they present themselves
-- and how supporters reach them. Identity (name, type, relationship, species,
-- registration_number), the account link (user_id), claim state and
-- verification are all deliberately excluded.
GRANT UPDATE (
  photo,
  bio,
  contact_email,
  website,
  facebook,
  twitter,
  instagram,
  linkedin,
  youtube,
  tiktok,
  visibility,
  updated_at
) ON beneficiaries TO authenticated;

NOTIFY pgrst, 'reload schema';
