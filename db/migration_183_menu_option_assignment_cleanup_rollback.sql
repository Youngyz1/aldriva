-- Rollback migration 183: restore the Phase 1 assignment-delete policy.
-- Drop both migration functions and their triggers before removing assignment updated_at.

BEGIN;

DROP TRIGGER IF EXISTS trg_menu_options_cleanup_assignments ON public.menu_options;
DROP FUNCTION IF EXISTS public.remove_deleted_menu_option_from_assignments();
DROP FUNCTION IF EXISTS public.upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb);
DROP TRIGGER IF EXISTS trg_menu_item_option_groups_updated_at ON public.menu_item_option_groups;
ALTER TABLE public.menu_item_option_groups DROP COLUMN IF EXISTS updated_at;

DROP POLICY IF EXISTS "Tenant editors can delete menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant managers can delete menu item option groups"
  ON public.menu_item_option_groups FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

COMMIT;
NOTIFY pgrst, 'reload schema';
