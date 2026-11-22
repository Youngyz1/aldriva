-- Rollback for Migration 198: Table & Menu QR Codes, Dine-In Ordering, and Waiter Confirmation
-- Reverses schema extensions. Guarded against data loss if active dine-in orders exist.

BEGIN;

-- ── 1. Guard against in-flight dine-in orders ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
     WHERE fulfilment_type = 'dine_in'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_198_ROLLBACK_BLOCKED: orders still use fulfilment_type = dine_in; resolve them before retrying';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
     WHERE customer_phone IS NULL
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_198_ROLLBACK_BLOCKED: orders exist with null customer_phone; resolve them before restoring NOT NULL';
  END IF;
END;
$$;

-- ── 2. Drop RLS policies ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can update table sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Staff can view table sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Staff can manage qr redirect codes" ON public.qr_redirect_codes;
DROP POLICY IF EXISTS "Staff can view qr redirect codes" ON public.qr_redirect_codes;
DROP POLICY IF EXISTS "Staff can manage business tables" ON public.business_tables;
DROP POLICY IF EXISTS "Staff can view business tables" ON public.business_tables;

-- ── 3. Drop tables (children first) ──────────────────────────────────────────
DROP TABLE IF EXISTS public.table_sessions;
DROP TABLE IF EXISTS public.qr_redirect_codes;
DROP TABLE IF EXISTS public.business_tables;

-- ── 4. Drop helper functions ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_dine_in_order(uuid, uuid, text, text, text, text, text, numeric, numeric, jsonb, text);
DROP FUNCTION IF EXISTS public.get_or_create_active_table_session(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.generate_qr_short_code();

-- ── 5. Revert public.orders extensions ───────────────────────────────────────
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_guest_token_hash_check;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_phone_required_by_fulfilment;
ALTER TABLE public.orders ALTER COLUMN customer_phone SET NOT NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_dine_in_confirmation_check;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_address_required;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_address_required
  CHECK (
    (((fulfilment_type = 'delivery'::text) AND (delivery_address IS NOT NULL) AND (length(TRIM(BOTH FROM delivery_address)) > 0))
     OR (fulfilment_type = 'pickup'::text))
  );

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfilment_type_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfilment_type_check
  CHECK (fulfilment_type = ANY (ARRAY['pickup'::text, 'delivery'::text]));

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS guest_token_hash,
  DROP COLUMN IF EXISTS dine_in_declined_reason,
  DROP COLUMN IF EXISTS dine_in_confirmation,
  DROP COLUMN IF EXISTS table_label,
  DROP COLUMN IF EXISTS table_session_id,
  DROP COLUMN IF EXISTS table_id;

-- ── 6. Revert public.businesses ──────────────────────────────────────────────
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_table_ordering_mode_check;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS table_ordering_mode;

COMMIT;

NOTIFY pgrst, 'reload schema';
