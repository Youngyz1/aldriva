-- Migration 182: reusable restaurant menu option groups and per-item assignments.
-- Additive only. Existing menu_items.option_groups JSON remains untouched.

CREATE TABLE IF NOT EXISTS public.menu_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('variant', 'addon')),
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= 1 AND max_select >= min_select),
  is_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_active boolean NOT NULL DEFAULT true,
  legacy_source_item_id uuid,
  legacy_group_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_option_groups_variant_shape CHECK (
    kind <> 'variant' OR (min_select = 1 AND max_select = 1 AND is_required = true)
  ),
  CONSTRAINT menu_option_groups_legacy_identity_unique UNIQUE (legacy_source_item_id, legacy_group_id)
);

CREATE TABLE IF NOT EXISTS public.menu_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.menu_option_groups(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 200),
  price numeric(12,2) NOT NULL CHECK (price >= 0 AND price <= 999999.99),
  image_url text,
  is_default boolean NOT NULL DEFAULT false,
  max_qty integer NOT NULL DEFAULT 1 CHECK (max_qty BETWEEN 1 AND 10),
  is_available boolean NOT NULL DEFAULT true,
  allergens text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(allergens) <= 12 AND allergens <@ ARRAY['nuts','dairy','gluten','soy','eggs','shellfish']::text[]),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  legacy_option_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_item_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.menu_option_groups(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  hidden_option_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  price_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(price_overrides) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_option_groups_item_group_unique UNIQUE (item_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_option_groups_organizer_id
  ON public.menu_option_groups(organizer_id);
CREATE INDEX IF NOT EXISTS idx_menu_option_groups_organizer_position
  ON public.menu_option_groups(organizer_id, position);
CREATE INDEX IF NOT EXISTS idx_menu_option_groups_legacy_source
  ON public.menu_option_groups(legacy_source_item_id) WHERE legacy_source_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_options_group_id
  ON public.menu_options(group_id);
CREATE INDEX IF NOT EXISTS idx_menu_options_organizer_id
  ON public.menu_options(organizer_id);
CREATE INDEX IF NOT EXISTS idx_menu_options_organizer_position
  ON public.menu_options(organizer_id, position);
CREATE INDEX IF NOT EXISTS idx_menu_options_group_position
  ON public.menu_options(group_id, position);
CREATE INDEX IF NOT EXISTS idx_menu_item_option_groups_organizer_id
  ON public.menu_item_option_groups(organizer_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_option_groups_item_id
  ON public.menu_item_option_groups(item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_option_groups_group_id
  ON public.menu_item_option_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_option_groups_organizer_position
  ON public.menu_item_option_groups(organizer_id, position);
CREATE INDEX IF NOT EXISTS idx_menu_item_option_groups_item_position
  ON public.menu_item_option_groups(item_id, position);

CREATE OR REPLACE FUNCTION public.set_menu_option_group_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_option_groups_updated_at ON public.menu_option_groups;
CREATE TRIGGER trg_menu_option_groups_updated_at
  BEFORE UPDATE ON public.menu_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();
DROP TRIGGER IF EXISTS trg_menu_options_updated_at ON public.menu_options;
CREATE TRIGGER trg_menu_options_updated_at
  BEFORE UPDATE ON public.menu_options
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();

CREATE OR REPLACE FUNCTION public.check_menu_option_organizer_match()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_organizer_id uuid;
  v_count integer;
BEGIN
  SELECT organizer_id INTO v_organizer_id
    FROM public.menu_option_groups WHERE id = NEW.group_id FOR UPDATE;
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Menu option group does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organizer_id <> v_organizer_id THEN
    RAISE EXCEPTION 'menu_options.organizer_id must match menu_option_groups.organizer_id' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_count FROM public.menu_options
    WHERE group_id = NEW.group_id AND id IS DISTINCT FROM NEW.id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'A menu option group can have at most 20 options' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_options_organizer_match ON public.menu_options;
CREATE TRIGGER trg_menu_options_organizer_match
  BEFORE INSERT OR UPDATE ON public.menu_options
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_option_organizer_match();

CREATE OR REPLACE FUNCTION public.check_menu_item_option_group_match()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_item_organizer_id uuid;
  v_group_organizer_id uuid;
  v_group_kind text;
  v_count integer;
  v_option_id uuid;
  v_value jsonb;
BEGIN
  SELECT organizer_id INTO v_item_organizer_id
    FROM public.menu_items WHERE id = NEW.item_id FOR UPDATE;
  IF v_item_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Menu item does not exist' USING ERRCODE = '23503';
  END IF;
  SELECT organizer_id, kind INTO v_group_organizer_id, v_group_kind
    FROM public.menu_option_groups WHERE id = NEW.group_id FOR UPDATE;
  IF v_group_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Menu option group does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organizer_id <> v_item_organizer_id OR NEW.organizer_id <> v_group_organizer_id THEN
    RAISE EXCEPTION 'Menu item, option group, and assignment must share an organizer' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_count FROM public.menu_item_option_groups
    WHERE item_id = NEW.item_id AND id IS DISTINCT FROM NEW.id;
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'A menu item can have at most 8 option groups' USING ERRCODE = '23514';
  END IF;
  IF v_group_kind = 'variant' AND EXISTS (
    SELECT 1
      FROM public.menu_item_option_groups a
      JOIN public.menu_option_groups g ON g.id = a.group_id
     WHERE a.item_id = NEW.item_id
       AND a.id IS DISTINCT FROM NEW.id
       AND g.kind = 'variant'
  ) THEN
    RAISE EXCEPTION 'A menu item can have at most one variant group' USING ERRCODE = '23514';
  END IF;

  IF cardinality(NEW.hidden_option_ids) > 20 THEN
    RAISE EXCEPTION 'At most 20 hidden option IDs are allowed' USING ERRCODE = '23514';
  END IF;
  FOREACH v_option_id IN ARRAY NEW.hidden_option_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.menu_options o WHERE o.id = v_option_id AND o.group_id = NEW.group_id) THEN
      RAISE EXCEPTION 'Hidden option must belong to the assigned group' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOR v_option_id, v_value IN
    SELECT key::uuid, value FROM jsonb_each(NEW.price_overrides)
  LOOP
    IF jsonb_typeof(v_value) <> 'number' THEN
      RAISE EXCEPTION 'Price overrides must be numeric amounts from 0 through 999999.99' USING ERRCODE = '23514';
    END IF;
    IF (v_value #>> '{}')::numeric < 0 OR (v_value #>> '{}')::numeric > 999999.99 THEN
      RAISE EXCEPTION 'Price overrides must be numeric amounts from 0 through 999999.99' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.menu_options o WHERE o.id = v_option_id AND o.group_id = NEW.group_id) THEN
      RAISE EXCEPTION 'Price override option must belong to the assigned group' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_item_option_groups_tenant_limits ON public.menu_item_option_groups;
CREATE TRIGGER trg_menu_item_option_groups_tenant_limits
  BEFORE INSERT OR UPDATE ON public.menu_item_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_item_option_group_match();

CREATE OR REPLACE FUNCTION public.check_menu_option_group_variant_reassignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'variant' AND EXISTS (
    SELECT 1
      FROM public.menu_item_option_groups assigned
      JOIN public.menu_item_option_groups other_assigned
        ON other_assigned.item_id = assigned.item_id
       AND other_assigned.id <> assigned.id
      JOIN public.menu_option_groups other_group ON other_group.id = other_assigned.group_id
     WHERE assigned.group_id = NEW.id
       AND other_group.kind = 'variant'
       AND other_group.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'A menu item can have at most one variant group' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_option_groups_variant_limit ON public.menu_option_groups;
CREATE TRIGGER trg_menu_option_groups_variant_limit
  BEFORE UPDATE OF kind, min_select, max_select, is_required ON public.menu_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_option_group_variant_reassignment();

CREATE OR REPLACE FUNCTION public.prevent_menu_option_group_tenant_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id AND (
    EXISTS (SELECT 1 FROM public.menu_options WHERE group_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.menu_item_option_groups WHERE group_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Cannot change the organizer of an option group with options or assignments' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_option_groups_organizer_change ON public.menu_option_groups;
CREATE TRIGGER trg_menu_option_groups_organizer_change
  BEFORE UPDATE OF organizer_id ON public.menu_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.prevent_menu_option_group_tenant_change();

CREATE OR REPLACE FUNCTION public.prevent_menu_item_option_group_tenant_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
    AND EXISTS (SELECT 1 FROM public.menu_item_option_groups WHERE item_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot change the organizer of a menu item with option group assignments' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_item_option_groups_parent_organizer ON public.menu_items;
CREATE TRIGGER trg_menu_item_option_groups_parent_organizer
  BEFORE UPDATE OF organizer_id ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_menu_item_option_group_tenant_change();

ALTER TABLE public.menu_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_option_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.menu_option_groups, public.menu_options, public.menu_item_option_groups FROM anon, authenticated;
GRANT SELECT ON TABLE public.menu_option_groups, public.menu_options, public.menu_item_option_groups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_option_groups, public.menu_options, public.menu_item_option_groups TO authenticated;
GRANT ALL ON TABLE public.menu_option_groups, public.menu_options, public.menu_item_option_groups TO service_role;

-- Public group reads require at least one active assigned item and active section.
DROP POLICY IF EXISTS "Public can view assigned active menu option groups" ON public.menu_option_groups;
CREATE POLICY "Public can view assigned active menu option groups"
  ON public.menu_option_groups FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
        FROM public.menu_item_option_groups a
        JOIN public.menu_items i ON i.id = a.item_id AND i.is_active = true
        JOIN public.menu_sections s ON s.id = i.section_id AND s.is_active = true
       WHERE a.group_id = menu_option_groups.id
    )
  );
DROP POLICY IF EXISTS "Tenant members can view menu option groups" ON public.menu_option_groups;
CREATE POLICY "Tenant members can view menu option groups"
  ON public.menu_option_groups FOR SELECT
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant editors can insert menu option groups" ON public.menu_option_groups;
CREATE POLICY "Tenant editors can insert menu option groups"
  ON public.menu_option_groups FOR INSERT
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant editors can update menu option groups" ON public.menu_option_groups;
CREATE POLICY "Tenant editors can update menu option groups"
  ON public.menu_option_groups FOR UPDATE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant managers can delete menu option groups" ON public.menu_option_groups;
CREATE POLICY "Tenant managers can delete menu option groups"
  ON public.menu_option_groups FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- Public assignment reads check the menu parents only. This avoids an RLS cycle
-- with the group policy above; inactive groups/options are filtered separately.
DROP POLICY IF EXISTS "Public can view assignments for active menu items" ON public.menu_item_option_groups;
CREATE POLICY "Public can view assignments for active menu items"
  ON public.menu_item_option_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.menu_items i
      JOIN public.menu_sections s ON s.id = i.section_id
      WHERE i.id = menu_item_option_groups.item_id
        AND i.is_active = true AND s.is_active = true
    )
  );
DROP POLICY IF EXISTS "Tenant members can view menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant members can view menu item option groups"
  ON public.menu_item_option_groups FOR SELECT
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant editors can insert menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant editors can insert menu item option groups"
  ON public.menu_item_option_groups FOR INSERT
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant editors can update menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant editors can update menu item option groups"
  ON public.menu_item_option_groups FOR UPDATE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant managers can delete menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant managers can delete menu item option groups"
  ON public.menu_item_option_groups FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- Public option reads require an available option, active group, active item and section.
DROP POLICY IF EXISTS "Public can view available assigned menu options" ON public.menu_options;
CREATE POLICY "Public can view available assigned menu options"
  ON public.menu_options FOR SELECT
  USING (
    is_available = true
    AND EXISTS (
      SELECT 1
        FROM public.menu_option_groups g
        JOIN public.menu_item_option_groups a ON a.group_id = g.id
        JOIN public.menu_items i ON i.id = a.item_id AND i.is_active = true
        JOIN public.menu_sections s ON s.id = i.section_id AND s.is_active = true
       WHERE g.id = menu_options.group_id AND g.is_active = true
    )
  );
DROP POLICY IF EXISTS "Tenant members can view menu options" ON public.menu_options;
CREATE POLICY "Tenant members can view menu options"
  ON public.menu_options FOR SELECT
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant editors can insert menu options" ON public.menu_options;
CREATE POLICY "Tenant editors can insert menu options"
  ON public.menu_options FOR INSERT
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant editors can update menu options" ON public.menu_options;
CREATE POLICY "Tenant editors can update menu options"
  ON public.menu_options FOR UPDATE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
DROP POLICY IF EXISTS "Tenant managers can delete menu options" ON public.menu_options;
CREATE POLICY "Tenant managers can delete menu options"
  ON public.menu_options FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
