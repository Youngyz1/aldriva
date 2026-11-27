-- migration_280_function_grant_hardening.sql
--
-- Closes four live grant gaps found by a direct pg_proc/pg_catalog.proacl
-- audit of the production database (not inferred from migration files,
-- which do not all show their current effective grants):
--
--   1. check_email_pending_deletion(text) -- migration_104 revoked EXECUTE
--      from anon and authenticated, but never revoked it from PUBLIC. In
--      Postgres, an explicit per-role REVOKE does not remove a standing
--      PUBLIC grant: has_function_privilege('anon', ...) is still true
--      today because anon inherits execute through the PUBLIC ACL entry.
--      The account-enumeration oracle migration_104 believed it closed is
--      still open. Fix: REVOKE ALL ... FROM PUBLIC, anon, authenticated
--      (the repeated anon/authenticated revoke is harmless and makes the
--      statement self-documenting). service_role keeps EXECUTE; the only
--      caller, POST /api/signup-guard (app/api/signup-guard/route.ts),
--      already uses supabaseAdmin.rpc(...).
--
--   2. reserve_seats_atomic(uuid[], int) -- granted to PUBLIC + anon +
--      authenticated + service_role. Repo-wide search finds exactly one
--      caller: lib/seating-server.ts:20, via createSupabaseAdmin()
--      (service_role). No client component, route handler, or server
--      action calls this RPC with the user-session or anon client, and no
--      file builds the function name as a string to call it indirectly.
--      Safe to narrow to service_role only. While CREATE OR REPLACE-ing the
--      body anyway (clamp below), also add input bounds: an admin-key
--      caller is trusted for *authorization*, but the hold-duration and
--      seat-count arguments still come from request bodies one layer up
--      (checkout/reservation flows), so they get the same defense-in-depth
--      bounding RPC inputs normally get in this repo.
--        - p_hold_duration_minutes: clamped (coerced) to [1, 15]. A hold is
--          just a time window; silently coercing an out-of-range value to
--          the nearest bound is safe and matches "clamp" literally.
--        - seat list: rejected (RAISE EXCEPTION), not silently truncated,
--          above 20 ids. Silently dropping seat ids from a bulk hold would
--          let a caller believe N seats are held when only 20 are, which is
--          the kind of silent-failure this repo's conventions (and
--          lib/seating-server.ts's own "no error swallowing" pattern)
--          explicitly avoid. Same bound ("20"), different enforcement
--          (reject vs. coerce) because unlike a duration, there is no safe
--          default subset of "which 20 seats" to keep.
--
--   3. assign_seat_to_invitation_atomic(uuid, uuid, uuid) -- granted to
--      PUBLIC + anon + authenticated + service_role. Same repo-wide search:
--      the only caller is lib/seating-server.ts:89, also via
--      createSupabaseAdmin(). Body is untouched (no input-bounding need --
--      it operates on exactly one seat and one invitation per call); only
--      grants are narrowed to service_role.
--
--   4. ensure_business_organizer(businesses) -- granted to PUBLIC + anon +
--      authenticated + service_role. Unlike the two seat functions, this
--      one is NOT trigger-only: it is a plain RETURNS UUID function taking
--      a `businesses` row, not RETURNS TRIGGER, so any role with EXECUTE
--      can call it directly over PostgREST with an arbitrary composite
--      argument -- including an owner_id belonging to a different user.
--      Because it is SECURITY DEFINER (migration_127, re-declared by
--      migration_173), that direct call bypasses organizers' own RLS
--      INSERT policy ("auth.uid() = user_id") and can create an organizer
--      Entity row attributed to any user_id the caller supplies. The
--      legitimate path is exclusively the BEFORE INSERT trigger
--      (trg_link_business_organizer, migration_58), itself SECURITY
--      INVOKER, fired by the one INSERT INTO businesses in the codebase
--      (lib/actions/businesses.ts, owner_id: user.id from the session --
--      no admin-on-behalf-of-user business-creation path exists anywhere
--      in app/ or lib/). Because the trigger runs as the inserting
--      `authenticated` role and calls this function mid-statement,
--      `authenticated` must keep EXECUTE for that path to keep working --
--      only `anon` and PUBLIC are revoked. The new guard below makes the
--      direct-call escalation impossible even for `authenticated`: it
--      requires business_row.owner_id to equal the caller's own auth.uid()
--      unless the caller is service_role, matching the
--      `auth.role() <> 'service_role'` idiom already used throughout this
--      repo (migrations 12, 60, 61, 105, 129, 168 and others) rather than
--      inventing a new convention.
--
-- All four CREATE OR REPLACE statements are followed by their own
-- REVOKE/GRANT pair in this same migration (not relying on order against
-- Supabase's bootstrap `ALTER DEFAULT PRIVILEGES ... TO anon, authenticated`
-- for new objects) -- CREATE OR REPLACE FUNCTION can re-trigger that default
-- grant, so the explicit REVOKE must run after the (re)declaration to be the
-- final word. This migration does not add, drop, or alter any
-- ALTER DEFAULT PRIVILEGES statement itself.
--
-- Verification: db/migration_280_function_grant_hardening_verification.sql
-- Rollback: db/migration_280_function_grant_hardening_rollback.sql
-- (re-opens all four gaps -- emergency use only; see rollback header).
--
-- NOT YET APPLIED to any environment. No push.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. check_email_pending_deletion(text) -- body unchanged, grants only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_email_pending_deletion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_pending_deletion(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. reserve_seats_atomic -- add input bounds, then narrow grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_seats_atomic(
  p_seat_ids UUID[],
  p_hold_duration_minutes INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_reserved_until TIMESTAMPTZ;
  v_unavailable_ids UUID[] := ARRAY[]::UUID[];
  v_reserved_count INT := 0;
BEGIN
  IF p_seat_ids IS NULL OR cardinality(p_seat_ids) = 0 THEN
    RAISE EXCEPTION 'NO_SEATS_PROVIDED';
  END IF;

  -- Bound the seat list: reject (don't silently truncate) above 20, so a
  -- caller never ends up holding fewer seats than it believes it asked for.
  IF cardinality(p_seat_ids) > 20 THEN
    RAISE EXCEPTION 'TOO_MANY_SEATS: at most 20 seat ids per call, got %', cardinality(p_seat_ids);
  END IF;

  -- Clamp the hold duration into [1, 15] minutes.
  p_hold_duration_minutes := LEAST(GREATEST(p_hold_duration_minutes, 1), 15);
  v_reserved_until := v_now + (p_hold_duration_minutes * INTERVAL '1 minute');

  -- Lock all target seats with FOR UPDATE in deterministic order to prevent deadlocks
  FOR v_seat IN (
    SELECT id, status, reserved_until, assigned_invitation_id
    FROM seats
    WHERE id = ANY(p_seat_ids)
    ORDER BY id
    FOR UPDATE
  ) LOOP
    -- Check if seat is sold, unavailable, active-reserved, or assigned to an active invitation
    IF v_seat.status = 'sold'
       OR v_seat.status = 'unavailable'
       OR v_seat.assigned_invitation_id IS NOT NULL
       OR (v_seat.status = 'reserved' AND v_seat.reserved_until IS NOT NULL AND v_seat.reserved_until > v_now)
    THEN
      v_unavailable_ids := array_append(v_unavailable_ids, v_seat.id);
    END IF;
  END LOOP;

  -- If any requested seat is unavailable or missing from lock set, abort with details
  IF cardinality(v_unavailable_ids) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Some seats are no longer available.',
      'unavailable_ids', to_jsonb(v_unavailable_ids)
    );
  END IF;

  -- Verify all requested seats exist
  SELECT COUNT(*) INTO v_reserved_count FROM seats WHERE id = ANY(p_seat_ids);
  IF v_reserved_count <> cardinality(p_seat_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'One or more seat IDs do not exist.'
    );
  END IF;

  -- Atomically apply reservation hold
  UPDATE seats
  SET status = 'reserved',
      reserved_until = v_reserved_until
  WHERE id = ANY(p_seat_ids);

  RETURN jsonb_build_object(
    'success', true,
    'reserved_until', v_reserved_until,
    'seat_ids', to_jsonb(p_seat_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION reserve_seats_atomic(UUID[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_seats_atomic(UUID[], INT) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. assign_seat_to_invitation_atomic -- body unchanged, grants only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION assign_seat_to_invitation_atomic(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_seat_to_invitation_atomic(UUID, UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. ensure_business_organizer -- add the caller/owner guard, then narrow
--    grants to authenticated + service_role (NOT anon, per the trigger path
--    requiring `authenticated`). Body otherwise matches migration_173
--    (lowercase-first slug fix) verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_business_organizer(business_row businesses)
RETURNS UUID AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
  -- Guard: a direct RPC call (this function is RETURNS UUID, not RETURNS
  -- TRIGGER, so EXECUTE alone is enough to invoke it with an arbitrary
  -- composite argument) may only claim an organizer for the caller's own
  -- account. service_role (the migration/backfill path, step 5 of
  -- migration_58) is exempt. The legitimate trigger path
  -- (trg_link_business_organizer) always passes NEW with
  -- owner_id = auth.uid() already, so this never fires for it.
  IF auth.role() <> 'service_role'
     AND business_row.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: business_row.owner_id must match the calling user'
      USING ERRCODE = '42501';
  END IF;

  base_slug := translate(
    lower(trim(business_row.name)),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ',
    'aaaaaaeeeeiiiiooooouuuuycn'
  );
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substr(base_slug, 1, 80);
  base_slug := regexp_replace(base_slug, '-+$', '', 'g');
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
      -- colliding (pathological case -- many identically-named businesses
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

REVOKE ALL ON FUNCTION ensure_business_organizer(businesses) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ensure_business_organizer(businesses) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
