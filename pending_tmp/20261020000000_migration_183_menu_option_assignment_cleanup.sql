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
  -- ON DELETE CASCADE removes the parent group before its child option rows.
  -- Do not update assignments after the group has disappeared; their own FK
  -- cascade will remove them without invoking the assignment UPDATE validator.
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_option_groups WHERE id = OLD.group_id
  ) THEN
    RETURN OLD;
  END IF;

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
DECLARE
  v_group record;
  v_option_signature jsonb;
  v_target_group_id uuid;
  v_group_map jsonb := '{}'::jsonb;
BEGIN
  PERFORM 1 FROM public.menu_items
   WHERE id = p_item_id AND organizer_id = p_organizer_id AND options_source = 'json'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item is missing, belongs to another organizer, or is already normalized'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
        id uuid, organizer_id uuid
      )
     WHERE organizer_id IS DISTINCT FROM p_organizer_id
  ) THEN
    RAISE EXCEPTION 'Every upgraded menu option group must belong to the item organizer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS row_data(
        group_id uuid, organizer_id uuid
      )
     WHERE organizer_id IS DISTINCT FROM p_organizer_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS input_group(id uuid)
           WHERE input_group.id = row_data.group_id
        )
  ) THEN
    RAISE EXCEPTION 'Every upgraded option must belong to an upgraded group and the item organizer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
        item_id uuid, group_id uuid, organizer_id uuid
      )
     WHERE item_id IS DISTINCT FROM p_item_id
        OR organizer_id IS DISTINCT FROM p_organizer_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS input_group(id uuid)
           WHERE input_group.id = row_data.group_id
        )
  ) THEN
    RAISE EXCEPTION 'Every upgraded assignment must match the item, organizer, and upgraded groups'
      USING ERRCODE = '23514';
  END IF;

  -- Reuse active, organizer-owned groups only when their normalized name,
  -- selection rules, and complete ordered option configuration are identical.
  FOR v_group IN
    SELECT *
      FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
        id uuid, organizer_id uuid, name text, kind text, min_select integer,
        max_select integer, is_required boolean, position integer, is_active boolean,
        legacy_source_item_id uuid, legacy_group_id text
      )
  LOOP
    SELECT COALESCE(jsonb_agg(option_signature ORDER BY option_signature::text), '[]'::jsonb)
      INTO v_option_signature
      FROM (
        SELECT jsonb_build_object(
          'name', lower(regexp_replace(btrim(option_row.name), '[[:space:]]+', ' ', 'g')),
          'description', CASE WHEN option_row.description IS NULL THEN NULL ELSE lower(regexp_replace(btrim(option_row.description), '[[:space:]]+', ' ', 'g')) END,
          'price', option_row.price,
          'image_url', option_row.image_url,
          'is_default', option_row.is_default,
          'max_qty', option_row.max_qty,
          'is_available', option_row.is_available,
          'allergens', to_jsonb(ARRAY(
            SELECT DISTINCT lower(allergen)
              FROM unnest(COALESCE(option_row.allergens, '{}'::text[])) AS allergy(allergen)
             ORDER BY lower(allergen)
          )),
          'position', option_row.position
        ) AS option_signature
          FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS option_row(
            group_id uuid, name text, description text, price numeric, image_url text,
            is_default boolean, max_qty integer, is_available boolean, allergens text[],
            position integer
          )
         WHERE option_row.group_id = v_group.id
      ) AS incoming_options;

    SELECT candidate.id
      INTO v_target_group_id
      FROM public.menu_option_groups AS candidate
     WHERE candidate.organizer_id = p_organizer_id
       AND candidate.is_active = true
       AND lower(regexp_replace(btrim(candidate.name), '[[:space:]]+', ' ', 'g'))
           = lower(regexp_replace(btrim(v_group.name), '[[:space:]]+', ' ', 'g'))
       AND candidate.kind = v_group.kind
       AND candidate.min_select = v_group.min_select
       AND candidate.max_select = v_group.max_select
       AND candidate.is_required = v_group.is_required
       AND COALESCE((
         SELECT jsonb_agg(option_signature ORDER BY option_signature::text)
           FROM (
             SELECT jsonb_build_object(
               'name', lower(regexp_replace(btrim(existing_option.name), '[[:space:]]+', ' ', 'g')),
               'description', CASE WHEN existing_option.description IS NULL THEN NULL ELSE lower(regexp_replace(btrim(existing_option.description), '[[:space:]]+', ' ', 'g')) END,
               'price', existing_option.price,
               'image_url', existing_option.image_url,
               'is_default', existing_option.is_default,
               'max_qty', existing_option.max_qty,
               'is_available', existing_option.is_available,
               'allergens', to_jsonb(ARRAY(
                 SELECT DISTINCT lower(allergen)
                   FROM unnest(COALESCE(existing_option.allergens, '{}'::text[])) AS allergy(allergen)
                  ORDER BY lower(allergen)
               )),
               'position', existing_option.position
             ) AS option_signature
               FROM public.menu_options AS existing_option
              WHERE existing_option.group_id = candidate.id
           ) AS existing_options
       ), '[]'::jsonb) = v_option_signature
     ORDER BY candidate.id
     LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.menu_option_groups (
        id, organizer_id, name, kind, min_select, max_select, is_required, position,
        is_active, legacy_source_item_id, legacy_group_id
      ) VALUES (
        v_group.id, v_group.organizer_id, v_group.name, v_group.kind,
        v_group.min_select, v_group.max_select, v_group.is_required,
        v_group.position, v_group.is_active, v_group.legacy_source_item_id,
        v_group.legacy_group_id
      );
      v_target_group_id := v_group.id;
    END IF;

    v_group_map := jsonb_set(v_group_map, ARRAY[v_group.id::text], to_jsonb(v_target_group_id), true);
  END LOOP;

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
    )
   WHERE v_group_map ->> row_data.group_id::text = row_data.group_id::text;

  INSERT INTO public.menu_item_option_groups (
    id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides
  )
  SELECT id, organizer_id, item_id, (v_group_map ->> row_data.group_id::text)::uuid,
         position, hidden_option_ids, price_overrides
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
