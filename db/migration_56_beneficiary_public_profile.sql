-- migration_56_beneficiary_public_profile.sql
--
-- 56.1  beneficiaries.slug — readable prefix + random suffix, non-enumerable
-- 56.2  slug auto-generation trigger for future rows
-- 56.3  GRANT SELECT on the new column (migration_55 made grants explicit)
-- 56.4  fundraisers: read-only access for the claimed beneficiary
--
-- Rollback: db/migration_56_beneficiary_public_profile_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 56.1  Slug column
--
-- Format: slugify(name) || '-' || 8 random hex chars, e.g. "nona-p-7f3a9c21".
--
-- The random suffix is the point. Beneficiaries are frequently the subject of
-- medical, housing or bereavement campaigns, so a purely name-derived slug
-- would let anyone walk the list by guessing names. Sequential ids would be
-- worse still. The readable prefix is kept only so a shared link is
-- recognisable to the person it belongs to.
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS slug text;

CREATE OR REPLACE FUNCTION beneficiary_slugify(p_name text, p_seed uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    coalesce(
      nullif(
        -- lower() BEFORE the character class, which is the bug migration_49
        -- had to repair on organizers. Trailing/leading dashes trimmed.
        trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'beneficiary'
    )
    || '-' || substr(md5(p_seed::text || random()::text), 1, 8);
$$;

-- Backfill. Every existing row gets its own random suffix, so no two rows can
-- collide even when the names are identical.
UPDATE beneficiaries
SET slug = beneficiary_slugify(name, id)
WHERE slug IS NULL;

ALTER TABLE beneficiaries ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficiaries_slug
  ON beneficiaries (slug);


-- ---------------------------------------------------------------------------
-- 56.2  Keep future rows populated.
--
-- A trigger rather than application code because beneficiaries are inserted
-- from more than one path (the resolve route today, potentially admin tooling
-- later) and a row without a slug has no public profile URL at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_beneficiary_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := beneficiary_slugify(NEW.name, coalesce(NEW.id, gen_random_uuid()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_beneficiary_slug ON beneficiaries;
CREATE TRIGGER trg_set_beneficiary_slug
  BEFORE INSERT ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION set_beneficiary_slug();


-- ---------------------------------------------------------------------------
-- 56.3  Grant the new column.
--
-- migration_55 revoked table-wide SELECT and re-granted per column, so a column
-- added afterwards is invisible to anon/authenticated until granted explicitly.
-- Without this the public profile route cannot resolve its own slug.
--
-- slug is NOT granted UPDATE: it is an identifier, not a profile field, and
-- letting a beneficiary rewrite it would break shared links.
-- ---------------------------------------------------------------------------
GRANT SELECT (slug) ON beneficiaries TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 56.4  Read-only campaign access for a claimed beneficiary.
--
-- Option (a): they can READ the fundraiser they are the beneficiary of,
-- including while it is still in pending_review, but get no UPDATE or DELETE.
-- Deliberately not co-ownership — the invite email promises "It does not give
-- you control of the campaign itself", and this policy keeps that true.
--
-- Mirrors the shape of the existing organizer ownership policy, substituting
-- the beneficiary link for the organizer link.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Beneficiaries can read their own campaign" ON fundraisers;
CREATE POLICY "Beneficiaries can read their own campaign" ON fundraisers
  FOR SELECT USING (
    beneficiary_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM beneficiaries b
      WHERE b.id = fundraisers.beneficiary_id
        AND b.user_id IS NOT NULL
        AND b.user_id = auth.uid()
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
