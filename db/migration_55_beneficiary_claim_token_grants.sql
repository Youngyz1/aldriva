-- migration_55_beneficiary_claim_token_grants.sql
--
-- CRITICAL: stop publishing beneficiary claim tokens.
--
-- `beneficiaries.claim_token` was readable through PostgREST by the anon role.
-- The token is the only thing gating /beneficiary/claim/[token], and the anon
-- key ships inside the browser bundle, so anyone could do:
--
--   GET /rest/v1/beneficiaries?select=claim_token&claim_token=not.is.null
--
-- ...and then claim any unclaimed beneficiary profile — taking control of the
-- photo, bio and contact links shown on a live fundraising campaign. Verified
-- against production: the request returned 200 with a live token.
--
-- `claim_email` was exposed by the same grant. That is the invitee's personal
-- email address, published to anonymous callers.
--
-- RLS restricts ROWS, never COLUMNS, so the row-level policy could not have
-- prevented this. Column-level GRANT is the mechanism.
--
-- The claim and invite routes read these columns through the service-role
-- client (app/api/beneficiary/claim, .../invite), which bypasses grants, so
-- the flow is unaffected.
--
-- Rollback: db/migration_55_beneficiary_claim_token_grants_rollback.sql

BEGIN;

REVOKE SELECT ON beneficiaries FROM anon, authenticated;

-- Everything except claim_token, claim_email and claim_sent_at.
GRANT SELECT (
  id, user_id, type, name, relationship, species, registration_number,
  photo, bio, contact_email, website, facebook, twitter, instagram,
  linkedin, youtube, tiktok, claimed_at, verified_at, visibility,
  created_at, updated_at, deleted_at
) ON beneficiaries TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
