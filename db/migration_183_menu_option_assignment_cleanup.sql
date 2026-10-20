-- Migration 183: dashboard support for reusable menu options.
-- Cleans assignment references on option deletion and provides an atomic JSON upgrade.

BEGIN;

ALTER TABLE public.menu_item_option_groups
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_menu_item_option_groups_updated_at ON public.menu_item_option_groups;
CREATE TRIGGER trg_menu_item_option_groups_updated_at
  BEFORE UPDATE ON public.menu_item_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();

CREATE OR REPLACE FUNCTION public.remove_deleted_menu_option_from_assignments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.menu_item_option_groups
     SET hidden_option_ids = array_remove(hidden_option_ids, OLD.id),
         price_overrides = price_overrides - OLD.id::text
   WHERE group_id = OLD.group_id
     AND (OLD.id = ANY(hidden_option_ids) OR price_overrides ? OLD.id::text);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_options_cleanup_assignments ON public.menu_options;
CREATE TRIGGER trg_menu_options_cleanup_assignments
  BEFORE DELETE ON public.menu_options
  FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_menu_option_from_assignments();

DROP POLICY IF EXISTS "Tenant managers can delete menu item option groups" ON public.menu_item_option_groups;
DROP POLICY IF EXISTS "Tenant editors can delete menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant editors can delete menu item option groups"
  ON public.menu_item_option_groups FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

CREATE OR REPLACE FUNCTION public.upgrade_menu_item_option_groups(
  p_item_id uuid,
  p_organizer_id uuid,
  p_groups jsonb,
  p_options jsonb,
  p_assignments jsonb
)
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.menu_items
   WHERE id = p_item_id AND organizer_id = p_organizer_id AND options_source = 'json'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item is missing, belongs to another organizer, or is already normalized'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.menu_option_groups (
    id, organizer_id, name, kind, min_select, max_select, is_required, position,
    is_active, legacy_source_item_id, legacy_group_id
  )
  SELECT id, organizer_id, name, kind, min_select, max_select, is_required, position,
         is_active, legacy_source_item_id, legacy_group_id
    FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
      id uuid, organizer_id uuid, name text, kind text, min_select integer,
      max_select integer, is_required boolean, position integer, is_active boolean,
      legacy_source_item_id uuid, legacy_group_id text
    );

  INSERT INTO public.menu_options (
    id, group_id, organizer_id, name, description, price, image_url, is_default,
    max_qty, is_available, allergens, position, legacy_option_id
  )
  SELECT id, group_id, organizer_id, name, description, price, image_url, is_default,
         max_qty, is_available, allergens, position, legacy_option_id
    FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS row_data(
      id uuid, group_id uuid, organizer_id uuid, name text, description text,
      price numeric, image_url text, is_default boolean, max_qty integer,
      is_available boolean, allergens text[], position integer, legacy_option_id text
    );

  INSERT INTO public.menu_item_option_groups (
    id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides
  )
  SELECT id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides
    FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
      id uuid, organizer_id uuid, item_id uuid, group_id uuid, position integer,
      hidden_option_ids uuid[], price_overrides jsonb
    );

  UPDATE public.menu_items SET options_source = 'normalized'
   WHERE id = p_item_id AND organizer_id = p_organizer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
