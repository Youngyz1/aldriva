-- Rollback for migration 182. Drops only objects introduced by that migration.

BEGIN;

DROP TRIGGER IF EXISTS trg_menu_item_option_groups_parent_organizer ON public.menu_items;
DROP TRIGGER IF EXISTS trg_menu_option_groups_organizer_change ON public.menu_option_groups;
DROP TRIGGER IF EXISTS trg_menu_options_variant_default ON public.menu_options;

DROP TABLE IF EXISTS public.menu_item_option_groups;
DROP TABLE IF EXISTS public.menu_options;
DROP TABLE IF EXISTS public.menu_option_groups;

ALTER TABLE public.menu_items DROP COLUMN IF EXISTS options_source;

DROP FUNCTION IF EXISTS public.check_menu_option_group_variant_reassignment();
DROP FUNCTION IF EXISTS public.check_menu_option_variant_default();
DROP FUNCTION IF EXISTS public.prevent_menu_item_option_group_tenant_change();
DROP FUNCTION IF EXISTS public.prevent_menu_option_group_tenant_change();
DROP FUNCTION IF EXISTS public.check_menu_item_option_group_match();
DROP FUNCTION IF EXISTS public.check_menu_option_organizer_match();
DROP FUNCTION IF EXISTS public.set_menu_option_group_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
