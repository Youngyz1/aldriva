-- migration_136_services_and_menus.sql
-- Phase 5: Products, Services & Menus — catalog foundation
-- Adds structured services, service pricing tiers, and restaurant/hospitality digital menus.
-- Tenant-scoped to organizers.id (canonical). No service_categories (intentionally omitted per DEC-0018).
-- Prices are local NUMERIC(12,2) for this phase — Stripe remains for products only.
-- Visibility is is_active BOOLEAN only (no draft/active/archived enum in Phase 5).
-- Dietary tags / allergens are bounded enums (max 12), modifiers JSONB bounded (max 12).
-- Note: position is NOT unique (ordering ties break on created_at) so creates and reorders never collide.

BEGIN;

-- ── 1. services ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 120),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) >= 1 AND char_length(slug) <= 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  duration_minutes integer CHECK (duration_minutes IS NULL OR (duration_minutes >= 5 AND duration_minutes <= 1440)),
  price numeric(12,2) NOT NULL CHECK (price >= 0 AND price <= 999999.99),
  image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 999),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizer_id, slug)
);

COMMENT ON TABLE services IS 'Structured business services, tenant-scoped to organizers.id. Price is local NUMERIC(12,2) for catalog display (no Stripe checkout in Phase 5).';
COMMENT ON COLUMN services.price IS 'Local display price for catalog. Stripe checkout not used for services in Phase 5.';

CREATE INDEX IF NOT EXISTS idx_services_organizer_id ON services(organizer_id);
CREATE INDEX IF NOT EXISTS idx_services_organizer_active ON services(organizer_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_services_organizer_position ON services(organizer_id, position ASC);

CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_services_updated_at ON services;
CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_services_updated_at();

-- ── 2. service_tiers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  duration_minutes integer CHECK (duration_minutes IS NULL OR (duration_minutes >= 5 AND duration_minutes <= 1440)),
  price numeric(12,2) NOT NULL CHECK (price >= 0 AND price <= 999999.99),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 999),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_tiers IS 'Pricing tiers for a service (e.g. Basic/Standard/Premium). Zero tiers allowed — simple service with base price is valid. ON DELETE CASCADE when parent service is deleted.';

CREATE INDEX IF NOT EXISTS idx_service_tiers_service_id ON service_tiers(service_id);
CREATE INDEX IF NOT EXISTS idx_service_tiers_service_position ON service_tiers(service_id, position ASC);

CREATE OR REPLACE FUNCTION update_service_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_tiers_updated_at ON service_tiers;
CREATE TRIGGER trg_service_tiers_updated_at
  BEFORE UPDATE ON service_tiers
  FOR EACH ROW EXECUTE FUNCTION update_service_tiers_updated_at();

-- ── 3. menu_sections ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS menu_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 999),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE menu_sections IS 'Menu sections/categories for restaurant/hospitality digital menus, ordered, tenant-scoped.';

CREATE INDEX IF NOT EXISTS idx_menu_sections_organizer_id ON menu_sections(organizer_id);
CREATE INDEX IF NOT EXISTS idx_menu_sections_organizer_position ON menu_sections(organizer_id, position ASC);

CREATE OR REPLACE FUNCTION update_menu_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_sections_updated_at ON menu_sections;
CREATE TRIGGER trg_menu_sections_updated_at
  BEFORE UPDATE ON menu_sections
  FOR EACH ROW EXECUTE FUNCTION update_menu_sections_updated_at();

-- ── 4. menu_items ────────────────────────────────────────────────────────

-- CHECK constraints cannot contain subqueries, so modifier validation lives in a function.
CREATE OR REPLACE FUNCTION menu_modifiers_valid(m jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN m IS NULL OR jsonb_typeof(m) <> 'array' THEN false
    WHEN jsonb_array_length(m) > 12 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(m) AS elem
      WHERE CASE
        WHEN jsonb_typeof(elem) <> 'object' THEN false
        WHEN jsonb_typeof(elem->'name') IS DISTINCT FROM 'string' THEN false
        WHEN char_length(elem->>'name') NOT BETWEEN 1 AND 80 THEN false
        WHEN jsonb_typeof(elem->'price_delta') IS DISTINCT FROM 'number' THEN false
        ELSE (elem->>'price_delta')::numeric BETWEEN -10000 AND 10000
      END IS NOT TRUE
    )
  END
$$;

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES menu_sections(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  price numeric(12,2) NOT NULL CHECK (price >= 0 AND price <= 999999.99),
  image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  dietary_tags text[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK (array_length(dietary_tags, 1) IS NULL OR array_length(dietary_tags, 1) <= 12),
  allergens text[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK (array_length(allergens, 1) IS NULL OR array_length(allergens, 1) <= 12),
  modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 999),
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_dietary_tags_enum_check CHECK (
    dietary_tags <@ ARRAY['vegan','vegetarian','gluten_free','halal','kosher','dairy_free','nut_free']::text[]
  ),
  CONSTRAINT menu_items_allergens_enum_check CHECK (
    allergens <@ ARRAY['nuts','dairy','gluten','soy','eggs','shellfish']::text[]
  ),
  CONSTRAINT menu_items_modifiers_check CHECK (menu_modifiers_valid(modifiers))
);

COMMENT ON TABLE menu_items IS 'Menu items (dishes) belonging to a menu_section. organizer_id is denormalized for simple RLS but enforced by trigger to match section.organizer_id.';
COMMENT ON COLUMN menu_items.dietary_tags IS 'Bounded enum array max 12: vegan, vegetarian, gluten_free, halal, kosher, dairy_free, nut_free.';
COMMENT ON COLUMN menu_items.allergens IS 'Bounded enum array max 12: nuts, dairy, gluten, soy, eggs, shellfish.';
COMMENT ON COLUMN menu_items.modifiers IS 'JSONB array max 12 of {name: 1..80, price_delta: -10000..10000}.';

CREATE INDEX IF NOT EXISTS idx_menu_items_section_id ON menu_items(section_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_organizer_id ON menu_items(organizer_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_organizer_active ON menu_items(organizer_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_menu_items_section_position ON menu_items(section_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_menu_items_dietary_tags_gin ON menu_items USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_menu_items_allergens_gin ON menu_items USING GIN (allergens);

CREATE OR REPLACE FUNCTION update_menu_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_menu_items_updated_at();

-- ── 5. Enforce menu_items.organizer_id = menu_sections.organizer_id ────

CREATE OR REPLACE FUNCTION check_menu_item_organizer_match()
RETURNS TRIGGER AS $$
DECLARE
  v_section_organizer uuid;
BEGIN
  SELECT organizer_id INTO v_section_organizer FROM menu_sections WHERE id = NEW.section_id;
  IF v_section_organizer IS NULL THEN
    RAISE EXCEPTION 'Menu section does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organizer_id <> v_section_organizer THEN
    RAISE EXCEPTION 'menu_items.organizer_id must match menu_sections.organizer_id' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_items_organizer_match ON menu_items;
CREATE TRIGGER trg_menu_items_organizer_match
  BEFORE INSERT OR UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION check_menu_item_organizer_match();

-- ── 6. Row Level Security ────────────────────────────────────────────────

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- services
DROP POLICY IF EXISTS "Public can view active services" ON services;
CREATE POLICY "Public can view active services"
  ON services FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Tenant members can view services" ON services;
CREATE POLICY "Tenant members can view services"
  ON services FOR SELECT
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert services" ON services;
CREATE POLICY "Tenant editors can insert services"
  ON services FOR INSERT
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update services" ON services;
CREATE POLICY "Tenant editors can update services"
  ON services FOR UPDATE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers can delete services" ON services;
CREATE POLICY "Tenant managers can delete services"
  ON services FOR DELETE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- service_tiers (access derived from parent service)
DROP POLICY IF EXISTS "Public can view active service tiers" ON service_tiers;
CREATE POLICY "Public can view active service tiers"
  ON service_tiers FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tiers.service_id
        AND services.is_active = true
    )
  );

DROP POLICY IF EXISTS "Tenant members can view service tiers" ON service_tiers;
CREATE POLICY "Tenant members can view service tiers"
  ON service_tiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tiers.service_id
        AND (
          is_entity_member(services.organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert service tiers" ON service_tiers;
CREATE POLICY "Tenant editors can insert service tiers"
  ON service_tiers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tiers.service_id
        AND (
          is_entity_member(services.organizer_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update service tiers" ON service_tiers;
CREATE POLICY "Tenant editors can update service tiers"
  ON service_tiers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tiers.service_id
        AND (
          is_entity_member(services.organizer_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tiers.service_id
        AND (
          is_entity_member(services.organizer_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Tenant managers can delete service tiers" ON service_tiers;
CREATE POLICY "Tenant managers can delete service tiers"
  ON service_tiers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tiers.service_id
        AND (
          is_entity_member(services.organizer_id, ARRAY['owner','admin','manager'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- menu_sections
DROP POLICY IF EXISTS "Public can view active menu sections" ON menu_sections;
CREATE POLICY "Public can view active menu sections"
  ON menu_sections FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Tenant members can view menu sections" ON menu_sections;
CREATE POLICY "Tenant members can view menu sections"
  ON menu_sections FOR SELECT
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert menu sections" ON menu_sections;
CREATE POLICY "Tenant editors can insert menu sections"
  ON menu_sections FOR INSERT
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update menu sections" ON menu_sections;
CREATE POLICY "Tenant editors can update menu sections"
  ON menu_sections FOR UPDATE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers can delete menu sections" ON menu_sections;
CREATE POLICY "Tenant managers can delete menu sections"
  ON menu_sections FOR DELETE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- menu_items
DROP POLICY IF EXISTS "Public can view active menu items" ON menu_items;
CREATE POLICY "Public can view active menu items"
  ON menu_items FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM menu_sections
      WHERE menu_sections.id = menu_items.section_id
        AND menu_sections.is_active = true
    )
  );

DROP POLICY IF EXISTS "Tenant members can view menu items" ON menu_items;
CREATE POLICY "Tenant members can view menu items"
  ON menu_items FOR SELECT
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert menu items" ON menu_items;
CREATE POLICY "Tenant editors can insert menu items"
  ON menu_items FOR INSERT
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update menu items" ON menu_items;
CREATE POLICY "Tenant editors can update menu items"
  ON menu_items FOR UPDATE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers can delete menu items" ON menu_items;
CREATE POLICY "Tenant managers can delete menu items"
  ON menu_items FOR DELETE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';