-- migration_50_beneficiary.sql
-- Introduces Beneficiary as a first-class concept: a fundraiser has an
-- Organizer (the account that runs it) and a Beneficiary (who it actually
-- helps). These are deliberately independent — the beneficiary is NOT a
-- user account and must not be modelled as one, so that verified
-- beneficiaries, beneficiary accounts, multiple beneficiaries, thank-you
-- messages and charity verification can all be layered on later without
-- reshaping what is stored today.
--
-- Note on prior state: lib/fundraiser-data.ts already SELECTed `beneficiary`
-- and `beneficiary_name` through its "optional fields" helper, but neither
-- column has ever existed. That helper swallows the resulting error and
-- returns nulls, so the fundraiser page's beneficiary slot silently fell
-- through to `fundraiser.title` — i.e. every campaign has been displaying its
-- own title as the beneficiary name. This migration is what makes that code
-- path real.
--
-- Shape: one JSONB document rather than a wide set of columns, because the
-- fields differ per beneficiary type (relationship for a person, species for
-- an animal, registration number for a charity). New types and fields become
-- additive JSON changes instead of migrations.
--
-- The two values the platform actually *queries* on — name (search) and type
-- (the planned "Helping: People / Animals / Charities…" filters) — are lifted
-- out into STORED generated columns. That keeps them indexable and reachable
-- through ordinary PostgREST filters (.eq/.ilike) while the JSONB stays the
-- single source of truth. They cannot drift, because Postgres derives them.

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS beneficiary jsonb;

-- Legacy rows predate the concept. Per spec they become self-beneficiary
-- fundraisers, named after the organizer: prefer the linked organizer
-- profile's name, then the denormalised text name, then a safe default so the
-- NOT-EMPTY check below can never fail on existing data.
UPDATE fundraisers f
SET beneficiary = jsonb_build_object(
      'type', 'self',
      'name', COALESCE(
        NULLIF(TRIM((SELECT o.name FROM organizers o WHERE o.id = f.organizer_id)), ''),
        NULLIF(TRIM(f.organizer), ''),
        'Campaign organizer'
      )
    )
WHERE f.beneficiary IS NULL;

-- Integrity at the DB level, not just in the form: a stored beneficiary must
-- be an object with a known type and a non-empty name (the two fields the
-- spec marks required). NULL is still permitted so that any write path not
-- yet updated — e.g. the GoFundMe/URL importers — keeps working instead of
-- hard-failing; the app resolves a fallback for those. Tightening this to
-- NOT NULL is a follow-up once every insert path sets it.
ALTER TABLE fundraisers
  DROP CONSTRAINT IF EXISTS fundraisers_beneficiary_valid;

ALTER TABLE fundraisers
  ADD CONSTRAINT fundraisers_beneficiary_valid CHECK (
    beneficiary IS NULL
    OR (
      jsonb_typeof(beneficiary) = 'object'
      AND beneficiary->>'type' IN (
        'self', 'person', 'family', 'organization', 'charity', 'community', 'animal'
      )
      AND COALESCE(TRIM(beneficiary->>'name'), '') <> ''
    )
  );

-- Derived, always-in-sync projections of the two queried fields.
ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS beneficiary_name text
    GENERATED ALWAYS AS (beneficiary->>'name') STORED,
  ADD COLUMN IF NOT EXISTS beneficiary_type text
    GENERATED ALWAYS AS (beneficiary->>'type') STORED;

-- Equality index backing the planned "Helping" filters. Deliberately no index
-- on beneficiary_name: search uses ILIKE '%…%', which a btree cannot serve,
-- and pg_trgm is not enabled on this database. The existing title/category
-- search has the same characteristic, so this is consistent rather than a
-- new regression — revisit together by enabling pg_trgm and adding GIN
-- indexes for title, category and beneficiary_name at once.
CREATE INDEX IF NOT EXISTS fundraisers_beneficiary_type_idx
  ON fundraisers(beneficiary_type);

NOTIFY pgrst, 'reload schema';
