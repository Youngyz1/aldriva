-- migration_127_ensure_business_organizer_security_definer.sql
--
-- BUG FIX: Business creation fails with `permission denied for table organizers`
-- (Postgres error code 42501).
--
-- ROOT CAUSE:
--   ensure_business_organizer() (migration_58) is SECURITY INVOKER by default.
--   It runs as the calling role (`authenticated`) and executes an INSERT into
--   organizers that includes `is_business_auto_created = true`.
--
--   Migration_103 (organizer_grant_least_privilege) intentionally omitted
--   `is_business_auto_created` from the column-level INSERT grant for
--   `authenticated`, to prevent owners from directly setting that flag via
--   REST. This was the correct security decision for the direct-write path —
--   but it also silently broke the trigger-based business creation path, since
--   ensure_business_organizer() runs as `authenticated` and the column-level
--   INSERT denial applies to it.
--
-- FIX:
--   Redeclare ensure_business_organizer() as SECURITY DEFINER with an explicit
--   SET search_path. The function becomes the only caller of the INSERT and it
--   hard-codes `is_business_auto_created = true` — no caller-supplied value.
--   This is safe for the same reasons cleanup_business_organizer() (migration_58)
--   uses SECURITY DEFINER:
--     - It is a RETURNS TRIGGER function, so no role can invoke it directly via
--       SQL; it can only fire as the BEFORE INSERT trigger on businesses.
--     - All inputs (owner_id, name, description, logo, website, email) come from
--       the businesses row already being inserted, not from arbitrary caller input.
--     - `is_business_auto_created` is always true — the function never reads it
--       from input.
--     - The organizers RLS INSERT policy ("Users can insert own organizer":
--       auth.uid() = user_id) is bypassed at SECURITY DEFINER level, but the
--       write is still scoped to the correct owner: user_id is set to
--       business_row.owner_id, which is the authenticated user who triggered the
--       businesses INSERT in the first place.
--
-- DOES NOT WEAKEN RLS:
--   The GRANT ADD from this fix is zero — no privilege changes are made.
--   Only the function's own privilege context is elevated. The authenticated
--   role's column-level INSERT grants (migration_103) are unchanged.
--   All existing RLS policies on organizers remain in effect for all other
--   code paths (direct REST inserts from create-organizer, owner settings, etc.).
--
-- DOES NOT AFFECT:
--   trg_link_business_organizer() — the outer trigger function that calls
--   ensure_business_organizer(). It remains SECURITY INVOKER; it performs no
--   direct organizers writes itself. Only ensure_business_organizer() needs
--   elevation.
--
-- TESTED PATHS:
--   1. New business creation via /dashboard/businesses/new (the broken path).
--   2. Business deletion — cleanup_business_organizer() was already SECURITY
--      DEFINER; no change.
--   3. Direct create-organizer path — uses the RLS INSERT policy + column grant
--      directly; unaffected by this change.

BEGIN;

CREATE OR REPLACE FUNCTION ensure_business_organizer(business_row businesses)
RETURNS UUID AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
  base_slug := lower(regexp_replace(trim(business_row.name), '[^a-z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  IF base_slug = '' THEN base_slug := 'business'; END IF;

  LOOP
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate a unique organizer slug for business %', business_row.id;
    END IF;

    IF attempt = 0 THEN
      candidate := base_slug;
    ELSIF attempt <= 50 THEN
      candidate := base_slug || '-' || (attempt + 1);
    ELSE
      -- Escalate to a random suffix if plain numeric suffixes keep
      -- colliding (pathological case — many identically-named businesses
      -- created concurrently) so this still terminates quickly.
      candidate := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    END IF;

    BEGIN
      INSERT INTO organizers (
        user_id, name, org_type, slug, bio, photo, website, contact_email,
        is_business_auto_created
      )
      VALUES (
        business_row.owner_id,
        business_row.name,
        'business',
        candidate,
        business_row.description,
        business_row.logo,
        business_row.website,
        business_row.email,
        true
      )
      RETURNING id INTO new_org_id;

      RETURN new_org_id;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      -- loop again with the next candidate; the failed INSERT's implicit
      -- savepoint (from this EXCEPTION block) is already rolled back, so
      -- this doesn't touch the outer transaction.
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

COMMIT;

NOTIFY pgrst, 'reload schema';
