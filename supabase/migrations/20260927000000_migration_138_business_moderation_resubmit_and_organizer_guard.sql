-- migration_138_business_moderation_resubmit_and_organizer_guard.sql
-- Follow-up to 137 (already applied live): add organizer_id to protected columns
-- and keep the same guard semantics. Also documents that re-screen of rejected
-- listings is handled in application code (lib/actions/businesses.ts) with
-- 3-per-24h cap — no additional DB change needed for that.
-- 137 is already live, so this file must not rewrite it.

BEGIN;

CREATE OR REPLACE FUNCTION guard_business_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (NEW.status = 'archived' AND OLD.owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'Not allowed to change business status' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.is_flagged IS DISTINCT FROM NEW.is_flagged THEN
    RAISE EXCEPTION 'Not allowed to change is_flagged' USING ERRCODE = '42501';
  END IF;
  IF OLD.is_featured IS DISTINCT FROM NEW.is_featured THEN
    RAISE EXCEPTION 'Not allowed to change is_featured' USING ERRCODE = '42501';
  END IF;
  IF OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason THEN
    RAISE EXCEPTION 'Not allowed to change rejection_reason' USING ERRCODE = '42501';
  END IF;
  IF OLD.listing_tier IS DISTINCT FROM NEW.listing_tier THEN
    RAISE EXCEPTION 'Not allowed to change listing_tier' USING ERRCODE = '42501';
  END IF;
  IF OLD.stripe_price_id IS DISTINCT FROM NEW.stripe_price_id THEN
    RAISE EXCEPTION 'Not allowed to change stripe_price_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id THEN
    RAISE EXCEPTION 'Not allowed to change stripe_subscription_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.current_period_end IS DISTINCT FROM NEW.current_period_end THEN
    RAISE EXCEPTION 'Not allowed to change current_period_end' USING ERRCODE = '42501';
  END IF;
  IF OLD.crypto_payment_id IS DISTINCT FROM NEW.crypto_payment_id THEN
    RAISE EXCEPTION 'Not allowed to change crypto_payment_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.pre_approval_status_snapshot IS DISTINCT FROM NEW.pre_approval_status_snapshot THEN
    RAISE EXCEPTION 'Not allowed to change pre_approval_status_snapshot' USING ERRCODE = '42501';
  END IF;
  IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Not allowed to change owner_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.organizer_id IS DISTINCT FROM NEW.organizer_id THEN
    RAISE EXCEPTION 'Not allowed to change organizer_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.screening_risk_score IS DISTINCT FROM NEW.screening_risk_score THEN
    RAISE EXCEPTION 'Not allowed to change screening_risk_score' USING ERRCODE = '42501';
  END IF;
  IF OLD.screened_at IS DISTINCT FROM NEW.screened_at THEN
    RAISE EXCEPTION 'Not allowed to change screened_at' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION guard_business_owner_update() IS 'Prevents owners from self-approving status=active, is_featured, listing_tier, organizer_id, etc. Service role (auth.uid IS NULL) and active admin bypass. Updated in 138 to also protect organizer_id.';

COMMIT;

NOTIFY pgrst, 'reload schema';
