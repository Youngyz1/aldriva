-- ============================================================================
-- 003_functions.sql — All 19 public-schema functions, verbatim from production
-- (pg_get_functiondef), in an order that respects intra-function PERFORM/call
-- dependencies. Requires 002_tables.sql to have run first (bodies reference
-- profiles, fundraisers, events, organizers, reviews, comment_likes, seats,
-- donations, auth.users).
--
-- These are reproduced AS-IS from production, preserving current behavior
-- exactly (including that check_email_pending_deletion is SECURITY DEFINER
-- without a pinned search_path, and 15 other functions don't pin search_path
-- either — see RECOMMENDATIONS.md items 7-8 for optional, separately-applied
-- follow-up; not part of this migration).
-- ============================================================================

-- 1. recalculate_event_rating -------------------------------------------------
create or replace function public.recalculate_event_rating(target_id uuid)
 returns void
 language plpgsql
as $function$
BEGIN
    UPDATE events
    SET
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE event_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE event_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$function$;

-- 2. recalculate_fundraiser_rating --------------------------------------------
create or replace function public.recalculate_fundraiser_rating(target_id uuid)
 returns void
 language plpgsql
as $function$
BEGIN
    UPDATE fundraisers
    SET
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE fundraiser_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE fundraiser_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$function$;

-- 3. recalculate_organizer_rating ---------------------------------------------
create or replace function public.recalculate_organizer_rating(target_id uuid)
 returns void
 language plpgsql
as $function$
BEGIN
    UPDATE organizers
    SET
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE organizer_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE organizer_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$function$;

-- 4. update_rating_aggregates (calls the 3 above via PERFORM; trigger fn) -----
create or replace function public.update_rating_aggregates()
 returns trigger
 language plpgsql
as $function$
DECLARE
    target_event_id UUID;
    target_fundraiser_id UUID;
    target_organizer_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_event_id := OLD.event_id;
        target_fundraiser_id := OLD.fundraiser_id;
        target_organizer_id := OLD.organizer_id;
    ELSE
        target_event_id := NEW.event_id;
        target_fundraiser_id := NEW.fundraiser_id;
        target_organizer_id := NEW.organizer_id;

        IF TG_OP = 'UPDATE' THEN
            IF OLD.event_id IS DISTINCT FROM NEW.event_id AND OLD.event_id IS NOT NULL THEN
                PERFORM recalculate_event_rating(OLD.event_id);
            END IF;
            IF OLD.fundraiser_id IS DISTINCT FROM NEW.fundraiser_id AND OLD.fundraiser_id IS NOT NULL THEN
                PERFORM recalculate_fundraiser_rating(OLD.fundraiser_id);
            END IF;
            IF OLD.organizer_id IS DISTINCT FROM NEW.organizer_id AND OLD.organizer_id IS NOT NULL THEN
                PERFORM recalculate_organizer_rating(OLD.organizer_id);
            END IF;
        END IF;
    END IF;

    IF target_event_id IS NOT NULL THEN
        PERFORM recalculate_event_rating(target_event_id);
    END IF;
    IF target_fundraiser_id IS NOT NULL THEN
        PERFORM recalculate_fundraiser_rating(target_fundraiser_id);
    END IF;
    IF target_organizer_id IS NOT NULL THEN
        PERFORM recalculate_organizer_rating(target_organizer_id);
    END IF;

    RETURN NULL;
END;
$function$;

-- 5. update_articles_updated_at (trigger fn) ----------------------------------
create or replace function public.update_articles_updated_at()
 returns trigger
 language plpgsql
as $function$
BEGIN
  NEW.updated_at = now();

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

-- 6. enforce_article_status_transition (trigger fn) ---------------------------
create or replace function public.enforce_article_status_transition()
 returns trigger
 language plpgsql
as $function$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- auth.uid() IS NULL means this write came from a service-role connection,
  -- not an authenticated user session (e.g. an admin approve/reject route that
  -- already checked isAdmin() in app code, or a signature-verified webhook).
  -- This trigger cannot distinguish "an authorized service-role call" from
  -- "any service-role call" — it trusts every such call to be authorized
  -- upstream. It only protects against authenticated non-admin users
  -- self-approving/rejecting.
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

-- 7. update_businesses_updated_at (trigger fn) --------------------------------
create or replace function public.update_businesses_updated_at()
 returns trigger
 language plpgsql
as $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 8. enforce_business_status_transition (trigger fn) --------------------------
create or replace function public.enforce_business_status_transition()
 returns trigger
 language plpgsql
as $function$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

-- 9. update_fundraiser_raised (trigger fn) -------------------------------------
create or replace function public.update_fundraiser_raised()
 returns trigger
 language plpgsql
as $function$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total
  FROM donations
  WHERE fundraiser_id = NEW.fundraiser_id
    AND status = 'completed';

  -- NOTE: this defensively probes information_schema at runtime to decide
  -- whether to write `raised`, `raised_amount`, or both. Confirm which column(s)
  -- actually exist on the recreated `fundraisers` table (see 002_tables.sql —
  -- both are created for parity with production) before relying on this.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraisers'
      AND column_name = 'raised'
  ) THEN
    UPDATE fundraisers
    SET raised = total
    WHERE id = NEW.fundraiser_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraisers'
      AND column_name = 'raised_amount'
  ) THEN
    UPDATE fundraisers
    SET raised_amount = total
    WHERE id = NEW.fundraiser_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 10. enforce_fundraiser_status_transition (trigger fn) ------------------------
create or replace function public.enforce_fundraiser_status_transition()
 returns trigger
 language plpgsql
as $function$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- Non-admins may only (re)submit for review — e.g. resubmit a rejected
  -- campaign — never move it to 'published' or 'rejected' themselves.
  IF NEW.status NOT IN ('pending_review') THEN
    RAISE EXCEPTION 'Only an admin can set fundraiser status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

-- 11. update_product_orders_updated_at (trigger fn) ----------------------------
create or replace function public.update_product_orders_updated_at()
 returns trigger
 language plpgsql
as $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 12. update_products_updated_at (trigger fn) -----------------------------------
create or replace function public.update_products_updated_at()
 returns trigger
 language plpgsql
as $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 13. enforce_product_status_transition (trigger fn) ---------------------------
create or replace function public.enforce_product_status_transition()
 returns trigger
 language plpgsql
as $function$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('pending_review', 'archived') THEN
    RETURN NEW;
  END IF;

  -- Owner may freely toggle between active <-> out_of_stock post-approval —
  -- restocking doesn't need re-review.
  IF OLD.status IN ('active', 'out_of_stock') AND NEW.status IN ('active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$function$;

-- 14. prevent_profile_role_status_self_update (trigger fn) ---------------------
create or replace function public.prevent_profile_role_status_self_update()
 returns trigger
 language plpgsql
as $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Role and status cannot be changed from account settings.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 15. release_expired_seat_reservations (RPC, not trigger-fired anywhere in DB;
--     app/cron must invoke this explicitly — no pg_cron job calls it) ----------
create or replace function public.release_expired_seat_reservations()
 returns void
 language plpgsql
as $function$
BEGIN
  UPDATE seats
  SET status = 'available', reserved_until = NULL
  WHERE status = 'reserved'
    AND reserved_until IS NOT NULL
    AND reserved_until < NOW();
END;
$function$;

-- 16. get_total_raised (RPC) ----------------------------------------------------
create or replace function public.get_total_raised()
 returns numeric
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT COALESCE(SUM(raised), 0)
  FROM public.fundraisers
  WHERE deleted_at IS NULL AND status = 'published';
$function$;

-- 17. get_comment_like_counts (RPC — this is the access path for comment_likes,
--     which has RLS enabled with ZERO policies; direct table access is closed) --
create or replace function public.get_comment_like_counts(ids uuid[])
 returns table(comment_id uuid, cnt bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select comment_id, count(*)::bigint
  from comment_likes
  where comment_id = any(ids)
  group by comment_id;
$function$;

-- 18. check_email_pending_deletion (RPC) ----------------------------------------
-- NOTE: this is the one function in the schema that combines SECURITY
-- DEFINER with an unset/mutable search_path, reproduced as-is from
-- production — see RECOMMENDATIONS.md item 7.
create or replace function public.check_email_pending_deletion(p_email text)
 returns table(pending_id uuid, purge_date timestamp with time zone)
 language plpgsql
 security definer
as $function$
BEGIN
  RETURN QUERY
  SELECT u.id, p.purge_at
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email = p_email
    AND p.deleted_at IS NOT NULL
    AND p.purge_at > now();
END;
$function$;

-- 19. handle_new_user (trigger fn on auth.users — see 004_triggers.sql) --------
-- ** MIGRATION-CRITICAL: must exist, with its trigger attached, before the new
--    project's first user signs up. Without it, new auth.users rows get no
--    matching public.profiles row, which breaks every RLS policy and every
--    lib/auth.ts helper that joins through profiles. **
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  INSERT INTO public.profiles (id, role, status, preferences)
  VALUES (NEW.id, 'user', 'active', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
