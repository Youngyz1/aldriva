-- migration_61_organizer_capability_tiers.sql
-- Phase 2 of the Entity architecture: adds Payment Enabled and
-- Fundraising Approved as entity-level capability tiers on organizers,
-- separate from organizers.status ("Organization/Business Verified",
-- already live) and from Identity Verified (migration_60, lives on
-- profiles). Per the spec: identity/business/organization/payment/
-- fundraising verification are independent — one does not imply another.
--
-- Tracked and admin-visible only this phase. Neither flag is wired to
-- actually gate payment processing or fundraiser creation yet — no
-- Stripe Connect and no document upload exist in this codebase yet
-- (later phases); this just gives admins a real, protected place to
-- record the capability once those exist.
--
-- Bundled fix, not scope creep: organizers' UPDATE RLS
-- ("Users can update own organizer": auth.uid() = user_id, no column
-- restriction) has never actually protected status/verified_at from an
-- owner self-updating them directly via REST — confirmed live, no
-- trigger has ever guarded those columns (organizers_schema.sql's own
-- delete policy and migration_48's own updated_at trigger both turned out
-- to never have been applied live either — this file's assumptions are
-- based on querying live pg_policies/pg_trigger, not the schema files).
-- Adding two more admin-only columns to the same unprotected table while
-- leaving status/verified_at exposed would be inconsistent and wouldn't
-- fully close the hole, so one trigger now guards all four together.

BEGIN;

-- 1. New columns.
ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS payment_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fundraising_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fundraising_approved_at TIMESTAMPTZ;

-- 2. Guard trigger. Same is_admin_user OR auth.uid() IS NULL idiom as
-- enforce_business_status_transition()/enforce_article_status_transition()
-- — the dominant convention in this codebase for "only an admin or a
-- service-role write may change this" — rather than the
-- auth.role() <> 'service_role' idiom used for profiles (migration_12/60),
-- to stay consistent with this table's own ecosystem. Every admin write
-- to organizers already goes through supabaseAdmin (service role, so
-- auth.uid() IS NULL) — confirmed by reading
-- app/api/admin/organizers/[id]/route.ts.
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

DROP TRIGGER IF EXISTS trg_enforce_organizer_capability_columns ON organizers;
CREATE TRIGGER trg_enforce_organizer_capability_columns
  BEFORE UPDATE ON organizers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_organizer_capability_columns();

-- 3. Reuse organizer_visibility_audit (migration_20) for the two new
-- boolean columns only — its old_value/new_value are INTEGER, which fits
-- booleans as 0/1 cleanly. Not retrofitting audit logging onto `status`
-- itself: that's a separate, pre-existing gap (no audit trail has ever
-- existed for Verify/Reject/Suspend actions) not required to land the
-- two new tiers, and this isn't the place to quietly promise historical
-- logging beyond what's actually being built.
ALTER TABLE organizer_visibility_audit DROP CONSTRAINT IF EXISTS organizer_visibility_audit_field_name_check;
ALTER TABLE organizer_visibility_audit ADD CONSTRAINT organizer_visibility_audit_field_name_check
  CHECK (field_name IN ('follower_offset', 'events_offset', 'payment_enabled', 'fundraising_approved'));

COMMIT;

NOTIFY pgrst, 'reload schema';
