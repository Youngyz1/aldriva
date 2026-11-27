-- migration_280_function_grant_hardening_rollback.sql
--
-- Emergency rollback for migration_280. Restores the pre-280 grant state
-- (PUBLIC/anon EXECUTE on all four functions) and the pre-280 function
-- bodies (no seat/duration bounds on reserve_seats_atomic, no
-- owner/caller guard on ensure_business_organizer).
--
-- This RE-OPENS:
--   - the check_email_pending_deletion account-enumeration oracle via PUBLIC
--   - anon/authenticated direct RPC access to the two seat functions
--   - the ensure_business_organizer direct-call privilege escalation
--     (arbitrary owner_id attribution for a new organizer Entity)
--
-- Use only to restore availability if migration_280 itself causes an
-- outage; re-apply 280 as soon as possible.

BEGIN;

-- 1. check_email_pending_deletion -- restore PUBLIC grant (anon/authenticated
--    stay revoked; that part was already migration_104's correct behavior).
GRANT EXECUTE ON FUNCTION public.check_email_pending_deletion(text) TO PUBLIC;

-- 2. reserve_seats_atomic -- restore pre-280 body (no bounds) and grants.
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
  v_reserved_until TIMESTAMPTZ := v_now + (p_hold_duration_minutes * INTERVAL '1 minute');
  v_unavailable_ids UUID[] := ARRAY[]::UUID[];
  v_reserved_count INT := 0;
BEGIN
  IF p_seat_ids IS NULL OR cardinality(p_seat_ids) = 0 THEN
    RAISE EXCEPTION 'NO_SEATS_PROVIDED';
  END IF;

  FOR v_seat IN (
    SELECT id, status, reserved_until, assigned_invitation_id
    FROM seats
    WHERE id = ANY(p_seat_ids)
    ORDER BY id
    FOR UPDATE
  ) LOOP
    IF v_seat.status = 'sold'
       OR v_seat.status = 'unavailable'
       OR v_seat.assigned_invitation_id IS NOT NULL
       OR (v_seat.status = 'reserved' AND v_seat.reserved_until IS NOT NULL AND v_seat.reserved_until > v_now)
    THEN
      v_unavailable_ids := array_append(v_unavailable_ids, v_seat.id);
    END IF;
  END LOOP;

  IF cardinality(v_unavailable_ids) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Some seats are no longer available.',
      'unavailable_ids', to_jsonb(v_unavailable_ids)
    );
  END IF;

  SELECT COUNT(*) INTO v_reserved_count FROM seats WHERE id = ANY(p_seat_ids);
  IF v_reserved_count <> cardinality(p_seat_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'One or more seat IDs do not exist.'
    );
  END IF;

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

GRANT EXECUTE ON FUNCTION reserve_seats_atomic(UUID[], INT) TO anon, authenticated, service_role;

-- 3. assign_seat_to_invitation_atomic -- restore grants (body never changed).
GRANT EXECUTE ON FUNCTION assign_seat_to_invitation_atomic(UUID, UUID, UUID) TO anon, authenticated, service_role;

-- 4. ensure_business_organizer -- restore pre-280 body (no owner guard) and grants.
CREATE OR REPLACE FUNCTION ensure_business_organizer(business_row businesses)
RETURNS UUID AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
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
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

GRANT EXECUTE ON FUNCTION ensure_business_organizer(businesses) TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
