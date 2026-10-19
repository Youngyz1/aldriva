-- migration_177_store_promo_codes_rollback.sql
-- Rollback for migration 177 (Store promo codes).
--
-- WARNING: dropping the table deletes all promo code definitions and usage
-- counts. product_orders rows are untouched (they carry no promo foreign key;
-- applied discounts live in each row's unit_price/total_amount snapshots).

DROP POLICY IF EXISTS "Tenant team members can view promo codes" ON public.promo_codes;
DROP TRIGGER IF EXISTS trg_promo_codes_updated_at ON public.promo_codes;
DROP FUNCTION IF EXISTS public.update_promo_codes_updated_at();
DROP FUNCTION IF EXISTS public.apply_promo_use(UUID);
DROP INDEX IF EXISTS public.promo_codes_tenant_code_unique;
DROP INDEX IF EXISTS public.idx_promo_codes_tenant_active;
DROP TABLE IF EXISTS public.promo_codes;

NOTIFY pgrst, 'reload schema';
