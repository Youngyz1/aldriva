-- migration_105_trigger_service_role_gate_rollback.sql
--
-- Emergency rollback for migration_105: restores the pre-F-04
-- `auth.uid() IS NULL` service-role carve-out in all seven approval triggers
-- and therefore RE-OPENS the F-04 over-broad bypass. Use only to restore
-- availability if the 105 migration itself causes an outage (e.g. a
-- legitimate write path that presents uid NULL with a non-service-role);
-- re-apply 105 as soon as possible. Function bodies below are verbatim
-- restorations of migrations 38/41/61/83/87.

BEGIN;

-- ── 1. articles (migration_38 original) ───────────────────────────────────
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

  -- auth.uid() IS NULL means this write came from a service-role connection
  -- (supabaseAdmin), not an authenticated user session — e.g. the admin
  -- approve/reject routes (isAdmin() checked in application code before the
  -- write) or a webhook (signature-verified before the write). This trigger
  -- has no way to tell "a legitimately gated service-role call" apart from
  -- "any service-role call" — it relies entirely on every such call already
  -- being authorized upstream. A future service-role write to this table's
  -- status column that skips its own gate (a new admin route missing an
  -- isAdmin() check, a one-off script, an ad hoc migration) will pass through
  -- here unchecked. This trigger only protects against authenticated
  -- non-admin users self-approving/rejecting — that is its entire job. See
  -- ADR 0001 §10 "Standing risk."
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. businesses (migration_38 original) ─────────────────────────────────
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

  -- See the identical comment on enforce_article_status_transition() above —
  -- same standing risk, same reasoning, not repeated here verbatim.
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. products (migration_38 original) ───────────────────────────────────
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

  -- See the identical comment on enforce_article_status_transition() above.
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

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
  -- exactly this transition, so it passes here without needing the
  -- auth.uid() IS NULL carve-out at all.
  IF OLD.status IN ('active', 'out_of_stock') AND NEW.status IN ('active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$$ LANGUAGE plpgsql;

-- ── 4. fundraisers (migration_41 original) ────────────────────────────────
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

  -- auth.uid() IS NULL means a service-role connection (the admin approve/reject
  -- route, which checks isAdmin() in app code before writing). Same standing
  -- risk documented on migration_38's enforce_article_status_transition(): this
  -- trigger only stops authenticated non-admin users from self-approving; it
  -- trusts every service-role write to have been authorized upstream.
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
$$ LANGUAGE plpgsql;

-- ── 5. organizers capability columns (migration_61 original) ──────────────
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

  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF NOT is_admin_user THEN
    RAISE EXCEPTION 'Only an admin can change organizer verification/capability fields';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. organizer_verification_submissions (migration_83 original) ─────────
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

    -- auth.uid() IS NULL means service role (supabaseAdmin) — allowed
    is_admin_user := is_admin_user OR auth.uid() IS NULL;

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

    -- auth.uid() IS NULL means service role (supabaseAdmin) — allowed
    is_admin_user := is_admin_user OR auth.uid() IS NULL;

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can set review fields on a verification submission';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 7. user_identity_verifications (migration_87 original) ────────────────
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

    is_admin := is_admin OR (auth.role() = 'service_role') OR (auth.uid() IS NULL);

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
