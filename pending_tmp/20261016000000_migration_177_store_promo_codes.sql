-- migration_177_store_promo_codes.sql
-- Store completion (Milestone 3): tenant-scoped promo/discount codes for the
-- multi-item Store cart checkout (Phase 6, Task 6.1 — renumbered from the
-- stale 139 in docs/phases/phase-06-commerce.md; canonical HEAD is 176).
--
-- Design notes:
-- - Codes belong to a tenant (organizers.id), not to an owner or business,
--   so every product sold through that tenant's Store qualifies. No per-item
--   eligibility matrix: a code applies to the whole cart subtotal.
-- - Either percent_off (1-90) XOR fixed_off_minor (+ fixed_currency) — never
--   both, never neither (CHECK).
-- - Usage is counted at webhook-paid time (not checkout time) so abandoned
--   carts never burn uses. apply_promo_use() increments atomically and only
--   while used_count < max_uses (or max_uses IS NULL = unlimited).
-- - Multi-item grouping needs NO schema change: cart product_orders rows are
--   linked by the existing product_orders.stripe_session_id column (indexed)
--   plus the Stripe session metadata id array. This migration adds only promo
--   infrastructure.
-- - RLS mirrors the reservations pattern: service_role bypasses; tenant team
--   members (owner/admin/manager/editor/finance) can SELECT; writes go
--   through the service-role checkout/webhook routes only.

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (char_length(code) BETWEEN 3 AND 40),
  percent_off INTEGER CHECK (percent_off IS NULL OR (percent_off BETWEEN 1 AND 90)),
  fixed_off_minor INTEGER CHECK (fixed_off_minor IS NULL OR fixed_off_minor > 0),
  fixed_currency TEXT CHECK (fixed_currency IS NULL OR fixed_currency ~ '^[A-Z]{3}$'),
  min_subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (min_subtotal_minor >= 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_exactly_one_discount CHECK (
    (percent_off IS NOT NULL AND fixed_off_minor IS NULL AND fixed_currency IS NULL)
    OR (percent_off IS NULL AND fixed_off_minor IS NOT NULL AND fixed_currency IS NOT NULL)
  ),
  CONSTRAINT promo_codes_window_valid CHECK (
    starts_at IS NULL OR expires_at IS NULL OR starts_at <= expires_at
  )
);

-- Case-insensitive uniqueness per tenant: "SAVE10" and "save10" collide.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_tenant_code_unique
  ON public.promo_codes (tenant_id, lower(code));
CREATE INDEX IF NOT EXISTS idx_promo_codes_tenant_active
  ON public.promo_codes (tenant_id) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.update_promo_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_promo_codes_updated_at ON public.promo_codes;
CREATE TRIGGER trg_promo_codes_updated_at
  BEFORE INSERT OR UPDATE ON public.promo_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_promo_codes_updated_at();

-- Atomic usage increment: succeeds (returns true) only while the cap allows.
-- Called once per paid cart session by the Stripe webhook, never per row.
CREATE OR REPLACE FUNCTION public.apply_promo_use(p_code_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  applied BOOLEAN := false;
BEGIN
  UPDATE public.promo_codes
  SET used_count = used_count + 1
  WHERE id = p_code_id
    AND is_active = true
    AND (max_uses IS NULL OR used_count < max_uses)
  RETURNING true INTO applied;
  RETURN COALESCE(applied, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.apply_promo_use(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_promo_use(UUID) TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.promo_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.promo_codes FROM anon;
REVOKE ALL ON TABLE public.promo_codes FROM authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;
GRANT SELECT ON TABLE public.promo_codes TO authenticated;

DROP POLICY IF EXISTS "Tenant team members can view promo codes" ON public.promo_codes;
CREATE POLICY "Tenant team members can view promo codes"
  ON public.promo_codes FOR SELECT
  USING (
    public.is_entity_member(promo_codes.tenant_id, ARRAY['owner','admin','manager','editor','finance'])
  );

NOTIFY pgrst, 'reload schema';
