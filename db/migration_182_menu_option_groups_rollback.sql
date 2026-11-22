-- Rollback for migration 182: menu option groups and per-item assignments.
-- Drops objects in reverse creation order. Data in menu_option_groups,
-- menu_options, and menu_item_option_groups will be lost.

BEGIN;

-- Drop triggers (reverse order)
DROP TRIGGER IF EXISTS trg_menu_item_option_groups_parent_organizer ON public.menu_items;
DROP TRIGGER IF EXISTS trg_menu_option_groups_organizer_change ON public.menu_option_groups;
DROP TRIGGER IF EXISTS trg_menu_option_groups_variant_limit ON public.menu_option_groups;
DROP TRIGGER IF EXISTS trg_menu_item_option_groups_tenant_limits ON public.menu_item_option_groups;
DROP TRIGGER IF EXISTS trg_menu_options_variant_default ON public.menu_options;
DROP TRIGGER IF EXISTS trg_menu_options_organizer_match ON public.menu_options;
DROP TRIGGER IF EXISTS trg_menu_options_updated_at ON public.menu_options;
DROP TRIGGER IF EXISTS trg_menu_option_groups_updated_at ON public.menu_option_groups;

-- Drop functions (reverse order)
DROP FUNCTION IF EXISTS public.prevent_menu_item_option_group_tenant_change();
DROP FUNCTION IF EXISTS public.prevent_menu_option_group_tenant_change();
DROP FUNCTION IF EXISTS public.check_menu_option_group_variant_reassignment();
DROP FUNCTION IF EXISTS public.check_menu_item_option_group_match();
DROP FUNCTION IF EXISTS public.check_menu_option_variant_default();
DROP FUNCTION IF EXISTS public.check_menu_option_organizer_match();
DROP FUNCTION IF EXISTS public.set_menu_option_group_updated_at();

-- Drop RLS policies
DROP POLICY IF EXISTS "Tenant managers can delete menu options" ON public.menu_options;
DROP POLICY IF EXISTS "Tenant editors can update menu options" ON public.menu_options;
DROP POLICY IF EXISTS "Tenant editors can insert menu options" ON public.menu_options;
DROP POLICY IF EXISTS "Tenant members can view menu options" ON public.menu_options;
DROP POLICY IF EXISTS "Public can view available assigned menu options" ON public.menu_options;

DROP POLICY IF EXISTS "Tenant managers can delete menu item option groups" ON public.menu_item_option_groups;
DROP POLICY IF EXISTS "Tenant editors can update menu item option groups" ON public.menu_item_option_groups;
DROP POLICY IF EXISTS "Tenant editors can insert menu item option groups" ON public.menu_item_option_groups;
DROP POLICY IF EXISTS "Tenant members can view menu item option groups" ON public.menu_item_option_groups;
DROP POLICY IF EXISTS "Public can view assignments for active menu items" ON public.menu_item_option_groups;

DROP POLICY IF EXISTS "Tenant managers can delete menu option groups" ON public.menu_option_groups;
DROP POLICY IF EXISTS "Tenant editors can update menu option groups" ON public.menu_option_groups;
DROP POLICY IF EXISTS "Tenant editors can insert menu option groups" ON public.menu_option_groups;
DROP POLICY IF EXISTS "Tenant members can view menu option groups" ON public.menu_option_groups;
DROP POLICY IF EXISTS "Public can view assigned active menu option groups" ON public.menu_option_groups;

-- Drop tables (children first for FK ordering)
DROP TABLE IF EXISTS public.menu_item_option_groups;
DROP TABLE IF EXISTS public.menu_options;
DROP TABLE IF EXISTS public.menu_option_groups;

-- Remove column and constraint added to menu_items
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_options_source_check;
ALTER TABLE public.menu_items DROP COLUMN IF EXISTS options_source;

COMMIT;

NOTIFY pgrst, 'reload schema';
