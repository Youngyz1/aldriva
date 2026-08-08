-- migration_51_beneficiary_accounts.sql
-- Phase A of beneficiary accounts: promote Beneficiary from an embedded JSONB
-- blob on `fundraisers` (migration_50) to a first-class table with stable ids.
--
-- Why this is required before accounts: an account has to attach to something
-- durable. While the beneficiary lives inside each fundraiser row, "Mary Doe"
-- helped by three campaigns is three disconnected copies — she would have
-- three photos to keep in sync, and being verified on one says nothing about
-- the others. A row with an id gives her one profile, one login, one verified
-- state, and is also the prerequisite for public beneficiary pages and for
-- multiple beneficiaries per fundraiser.
--
-- Expand/contract, not a rewrite: `fundraisers.beneficiary` (JSONB) is left in
-- place and still populated. Application code moves to `beneficiary_id`, and a
-- later migration drops the JSONB once nothing reads it. Deploy order
-- therefore cannot break anything in either direction.

CREATE TABLE IF NOT EXISTS beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The account link. Nullable and expected to stay null for most rows: a
  -- beneficiary is a real person or group described by an organizer, and most
  -- will never claim a login. An account is something they opt into, never
  -- something created on their behalf.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Identity, carried over from the migration_50 JSONB shape.
  type text NOT NULL CHECK (
    type IN ('self', 'person', 'family', 'organization', 'charity', 'community', 'animal')
  ),
  name text NOT NULL CHECK (TRIM(name) <> ''),
  relationship text,
  species text,
  registration_number text,

  -- The profile the beneficiary controls once they claim the account:
  -- photo, a short bio, and the ways people can reach them.
  photo text,
  bio text,
  contact_email text,
  website text,
  facebook text,
  twitter text,
  instagram text,
  linkedin text,
  youtube text,
  tiktok text,

  -- Claim flow (Phase B). Held here rather than a separate invitations table
  -- because a beneficiary is claimed at most once; a token column is enough.
  claim_email text,
  claim_token text UNIQUE,
  claim_sent_at timestamptz,
  claimed_at timestamptz,

  -- Verification (Phase C) — column reserved so the badge can be added
  -- without another migration.
  verified_at timestamptz,

  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS beneficiary_id uuid
    REFERENCES beneficiaries(id) ON DELETE SET NULL;

-- Backfill: one beneficiaries row per distinct (type, name), so a beneficiary
-- named on several campaigns becomes one profile rather than duplicates —
-- which is the whole point of the table. Case-insensitive on name to avoid
-- "Mary Doe" and "mary doe" splitting into two people.
INSERT INTO beneficiaries (type, name)
SELECT DISTINCT ON (f.beneficiary_type, LOWER(TRIM(f.beneficiary_name)))
       f.beneficiary_type,
       TRIM(f.beneficiary_name)
FROM fundraisers f
WHERE f.beneficiary_type IS NOT NULL
  AND COALESCE(TRIM(f.beneficiary_name), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM beneficiaries b
    WHERE b.type = f.beneficiary_type
      AND LOWER(b.name) = LOWER(TRIM(f.beneficiary_name))
  )
ORDER BY f.beneficiary_type, LOWER(TRIM(f.beneficiary_name)), f.created_at;

UPDATE fundraisers f
SET beneficiary_id = b.id
FROM beneficiaries b
WHERE f.beneficiary_id IS NULL
  AND b.type = f.beneficiary_type
  AND LOWER(b.name) = LOWER(TRIM(f.beneficiary_name));

CREATE INDEX IF NOT EXISTS beneficiaries_user_id_idx ON beneficiaries(user_id);
CREATE INDEX IF NOT EXISTS beneficiaries_type_idx ON beneficiaries(type);
CREATE INDEX IF NOT EXISTS fundraisers_beneficiary_id_idx ON fundraisers(beneficiary_id);

ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;

-- Read: public rows, or your own once claimed. Deliberately NOT a blanket
-- `USING (true)` — the organizers table carries both that and a visibility
-- check, and because RLS policies OR together the permissive one wins and the
-- visibility setting has no effect. Not repeating that here.
DROP POLICY IF EXISTS "Public beneficiaries are readable" ON beneficiaries;
CREATE POLICY "Public beneficiaries are readable" ON beneficiaries
  FOR SELECT
  USING (
    (visibility = 'public' AND deleted_at IS NULL)
    OR (user_id IS NOT NULL AND auth.uid() = user_id)
  );

-- Create: any signed-in user, since organizers create a beneficiary while
-- setting up a fundraiser. `user_id` must not be set at creation — an
-- organizer cannot pre-bind a beneficiary record to somebody else's account;
-- that link is only ever established by the claim flow.
DROP POLICY IF EXISTS "Authenticated users can create beneficiaries" ON beneficiaries;
CREATE POLICY "Authenticated users can create beneficiaries" ON beneficiaries
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL);

-- Update: only the beneficiary who has claimed the record, and only their own.
-- Organizer-side edits go through the service-role path used by the fundraiser
-- forms, so an organizer editing campaign details can never overwrite a
-- claimed beneficiary's own profile.
DROP POLICY IF EXISTS "Beneficiaries can update their own profile" ON beneficiaries;
CREATE POLICY "Beneficiaries can update their own profile" ON beneficiaries
  FOR UPDATE TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
