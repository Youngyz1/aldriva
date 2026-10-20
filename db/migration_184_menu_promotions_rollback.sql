-- Rollback for migration 184. Removes only menu-promotion objects.
BEGIN;

REVOKE ALL ON public.promotions, public.promotion_targets FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_promotion_targets_organizer_match ON public.promotion_targets;
DROP TRIGGER IF EXISTS trg_promotions_organizer_match ON public.promotions;
DROP TRIGGER IF EXISTS trg_promotion_targets_updated_at ON public.promotion_targets;
DROP TRIGGER IF EXISTS trg_promotions_updated_at ON public.promotions;
DROP TABLE IF EXISTS public.promotion_targets;
DROP TABLE IF EXISTS public.promotions;
DROP FUNCTION IF EXISTS public.check_menu_promotion_organizer_match();
DROP FUNCTION IF EXISTS public.set_menu_promotion_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
