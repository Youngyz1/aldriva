-- migration_105_trigger_service_role_gate.sql
--
-- P1 F-04: stop treating auth.uid() IS NULL as service-role in approval triggers.
--
-- Each trigger below used `is_admin := is_admin OR auth.uid() IS NULL`,
-- treating a null auth.uid() as equivalent to service-role. But auth.uid()
-- is also null for anonymous REST calls — not just service-role — so the
-- carve-out was wider than intended. Replaced with
-- `auth.role() = 'service_role'` alone, matching the already-safe pattern
-- used for profiles in migrations 12/60 (`IF auth.role() <> 'service_role'`).
--
-- Behavior change is intentionally narrow. The swap differs from the old
-- idiom ONLY for sessions with uid NULL and role <> 'service_role' (i.e.
-- direct anon REST): those now fail the trigger instead of passing it.
-- Service-role writes (role IS 'service_role': admin routes, gated
-- service-role helpers, signature-verified webhooks) pass exactly as before;
-- authenticated users (uid non-null) are decided by the admin lookup exactly
-- as before. No trigger, policy, grant, or column changes in this migration.
--
-- Reachability (verified against current code, post-101/103/104): no
-- anon-reachable ungated write path exists to any affected table — every
-- table's INSERT/UPDATE RLS requires auth.uid() = owner (fundraisers per
-- 101: uid IS NOT NULL AND uid = user_id; organizers: no anon write policy
-- at all plus zero anon write grants per 103), and every service-role app
-- write is gated (isAdmin/ownership/webhook-HMAC). So this is
-- defense-in-depth hardening, NOT a live exploit fix — but it makes the
-- triggers actually mean "admin or service-role" instead of relying on RLS
-- to keep anon out. See also ADR 0001 ("Standing risk") for the unchanged
-- residual: triggers still cannot distinguish a legitimately gated
-- service-role call from any service-role call.
--
-- Functions recreated verbatim except the gate line (and its stale comment):
--   enforce_article_status_transition     (migration_38, articles)
--   enforce_business_status_transition    (migration_38, businesses)
--   enforce_product_status_transition     (migration_38, products)
--   enforce_fundraiser_status_transition  (migration_41, fundraisers)
--   enforce_organizer_capability_columns  (migration_61, organizers)
--   prevent_submission_self_approval      (migration_83, organizer_verification_submissions)
--   prevent_user_identity_self_approval   (migration_87, user_identity_verifications)
-- CREATE OR REPLACE preserves existing grants and trigger bindings.
--
-- Rollback: db/migration_105_trigger_service_role_gate_rollback.sql
-- (restores the uid-IS-NULL carve-out — emergency use only).

BEGIN;

-- ── 1. articles (migration_38) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_article_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW; -- no status change in this UPDATE — nothing to enforce
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- Only a genuine service-role connection bypasses the admin check.
  -- auth.uid() IS NULL must NOT imply service-role: it is also null for
  -- anonymous REST calls. Service-role callers (admin approve/reject routes
  -- with isAdmin() checked upstream, signature-verified webhooks) carry
  -- role = 'service_role' and pass here; everything else needs the admin
  -- lookup above. Residual standing risk unchanged: this trigger still
  -- cannot tell a legitimately gated service-role call apart from any
  -- service-role call — see ADR 0001 §10 "Standing risk."
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. businesses (migration_38) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_business_status_transition()
RETURNS TRIGGER AS $$
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

  -- Same gate as enforce_article_status_transition() above.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. products (migration_38) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_product_status_transition()
RETURNS TRIGGER AS $$
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

  -- Same gate as enforce_article_status_transition() above.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('pending_review', 'archived') THEN
    RETURN NEW;
  END IF;

  -- Owner may freely toggle between active <-> out_of_stock post-approval —
  -- restocking doesn't need re-review. Allowed regardless of admin status,
  -- which is also what makes this safe for decrementProductStock's
  -- service-role write (lib/productOrders.ts) — that write always performs
  -- exactly this transition, so it passes here without needing any
  -- service-role carve-out at all.
  IF OLD.status IN ('active', 'out_of_stock') AND NEW.status IN ('active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$$ LANGUAGE plpgsql;

-- ── 4. fundraisers (migration_41) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_fundraiser_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW; -- no status change in this UPDATE — nothing to enforce
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- Only a genuine service-role connection bypasses the admin check (the
  -- admin approve/reject route, which checks isAdmin() in app code before
  -- writing). Same standing risk as migration_38: this trigger only stops
  -- authenticated non-admin users from self-approving; it trusts every
  -- service-role write to have been authorized upstream.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

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
$$ LANGUAGE plpgsql;

-- ── 5. organizers capability columns (migration_61) ───────────────────────
CREATE OR REPLACE FUNCTION enforce_organizer_capability_columns()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
     AND NEW.payment_enabled IS NOT DISTINCT FROM OLD.payment_enabled
     AND NEW.payment_enabled_at IS NOT DISTINCT FROM OLD.payment_enabled_at
     AND NEW.fundraising_approved IS NOT DISTINCT FROM OLD.fundraising_approved
     AND NEW.fundraising_approved_at IS NOT DISTINCT FROM OLD.fundraising_approved_at
  THEN
    RETURN NEW; -- none of the guarded columns are changing in this UPDATE
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- Only a genuine service-role connection bypasses the admin check. Every
  -- admin write to organizers already goes through supabaseAdmin (role =
  -- 'service_role') — confirmed by reading
  -- app/api/admin/organizers/[id]/route.ts.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF NOT is_admin_user THEN
    RAISE EXCEPTION 'Only an admin can change organizer verification/capability fields';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. organizer_verification_submissions (migration_83) ──────────────────
CREATE OR REPLACE FUNCTION prevent_submission_self_approval()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Guard: only admin or service role may transition status to a review-outcome
  -- state ('approved', 'rejected', 'needs_more_info'). Regular authenticated
  -- users may only move between 'draft' and 'submitted'.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'rejected', 'needs_more_info')
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    ) INTO is_admin_user;

    -- Only a genuine service-role connection bypasses the admin check.
    is_admin_user := is_admin_user OR auth.role() = 'service_role';

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can approve, reject, or request more information on a verification submission';
    END IF;
  END IF;

  -- Guard: only admin or service role may set reviewed_by, reviewed_at,
  -- or reviewer_notes (belt-and-suspenders — these are review-only fields).
  IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    ) INTO is_admin_user;

    -- Only a genuine service-role connection bypasses the admin check.
    is_admin_user := is_admin_user OR auth.role() = 'service_role';

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can set review fields on a verification submission';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 7. user_identity_verifications (migration_87) ─────────────────────────
CREATE OR REPLACE FUNCTION prevent_user_identity_self_approval()
RETURNS TRIGGER AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- If review outcome columns or status approved/rejected/needs_more_info are set:
  IF (NEW.status IN ('approved', 'rejected', 'needs_more_info') AND OLD.status NOT IN ('approved', 'rejected', 'needs_more_info'))
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    ) INTO is_admin;

    -- Only a genuine service-role connection bypasses the admin check.
    is_admin := is_admin OR (auth.role() = 'service_role');

    IF NOT is_admin THEN
      RAISE EXCEPTION 'Only an administrator can approve, reject, or set review fields on identity verifications.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

NOTIFY pgrst, 'reload schema';
