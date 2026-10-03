-- migration_137_business_moderation_guard_and_screening.sql
-- Phase 5 hardening: close owner self-approval hole + add automated screening tables/columns
-- Ground truth: businesses INSERT RLS requires status='pending_review' (keep as is)
-- UPDATE RLS currently allows owners to set any column, including status='active' etc.
-- This migration adds a BEFORE UPDATE trigger that blocks non-admin owners from promoting themselves.

BEGIN;

-- ── 1. Screening columns on businesses (additive, nullable) ──────────────

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS screening_risk_score integer
  CONSTRAINT businesses_screening_risk_score_check CHECK (screening_risk_score IS NULL OR (screening_risk_score >= 0 AND screening_risk_score <= 100));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS screened_at timestamptz;

COMMENT ON COLUMN businesses.screening_risk_score IS 'Automated screening risk 0..100, set by service role via screenBusiness engine';
COMMENT ON COLUMN businesses.screened_at IS 'When last screened';

-- ── 3. business_moderation_events table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS business_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  decision text NOT NULL
    CONSTRAINT business_moderation_events_decision_check
    CHECK (decision IN ('auto_approved','queued','auto_rejected','manual_approved','manual_rejected','re_screen_queued','re_screen_passed')),
  risk_score integer NOT NULL
    CONSTRAINT business_moderation_events_risk_score_check
    CHECK (risk_score >= 0 AND risk_score <= 100),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_moderation_events IS 'History of automated and manual moderation decisions for businesses';

CREATE INDEX IF NOT EXISTS idx_business_moderation_events_business_created ON business_moderation_events(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_moderation_events_decision_created ON business_moderation_events(decision, created_at DESC);

ALTER TABLE business_moderation_events ENABLE ROW LEVEL SECURITY;

-- Only active admins can read; no insert/update/delete policies (service role writes)
DROP POLICY IF EXISTS "Admins can view moderation events" ON business_moderation_events;
CREATE POLICY "Admins can view moderation events"
  ON business_moderation_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policies: service role only

-- ── 4. Guard trigger on businesses ───────────────────────────────────────

CREATE OR REPLACE FUNCTION guard_business_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Service role / backend (auth.uid() IS NULL) bypasses
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Active admin bypass
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  -- For authenticated non-admin owners, enforce protected columns
  -- Allow owner to archive their own listing (status -> 'archived') even if not admin
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
  -- screening columns also protected from owner self-set
  IF OLD.screening_risk_score IS DISTINCT FROM NEW.screening_risk_score THEN
    RAISE EXCEPTION 'Not allowed to change screening_risk_score' USING ERRCODE = '42501';
  END IF;
  IF OLD.screened_at IS DISTINCT FROM NEW.screened_at THEN
    RAISE EXCEPTION 'Not allowed to change screened_at' USING ERRCODE = '42501';
  END IF;

  -- slug, name, description, industry, category, business_type, website, email, phone, address etc are allowed
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_owner_update ON businesses;
CREATE TRIGGER trg_guard_business_owner_update
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION guard_business_owner_update();

COMMENT ON FUNCTION guard_business_owner_update() IS 'Prevents owners from self-approving status=active, is_featured, listing_tier, etc. Service role (auth.uid IS NULL) and active admin bypass.';

COMMIT;

NOTIFY pgrst, 'reload schema';
