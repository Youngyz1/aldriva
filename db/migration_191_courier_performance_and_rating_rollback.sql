-- Rollback for migration 191: courier delivery performance RPC + customer delivery rating.
-- Owner applies this SQL manually via Supabase SQL Editor.

BEGIN;

DROP FUNCTION IF EXISTS public.get_business_courier_performance(
  uuid,
  uuid,
  timestamptz,
  timestamptz
);

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS delivery_rating_comment,
  DROP COLUMN IF EXISTS delivery_rating;

NOTIFY pgrst, 'reload schema';
COMMIT;
