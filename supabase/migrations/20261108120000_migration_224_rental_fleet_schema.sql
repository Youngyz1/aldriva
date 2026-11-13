-- 20261108120000_migration_224_rental_fleet_schema.sql
-- Slice 1: Fleet Inventory & Management Core (Aldriva Vehicle Rental Engine)
-- Target branch: feat/rental-overview
-- Documentation & Architecture: docs/design/rental/architecture.md §4 (Slice 1)
--
-- Creates:
--   1. public.vehicle_categories: Tenant-scoped category taxonomy with base rates,
--      security deposits, specs (seats, transmission, doors, luggage, ac) and slug.
--   2. public.vehicles: Individual physical vehicle assets stationed at branches
--      with mileage, fuel type, status, and unique license plate per business.
--
-- Tenant scoping: Both tables strictly require organizer_id (canonical tenant)
-- and business_id, with foreign keys ON DELETE CASCADE.
-- Category FK on vehicles uses ON DELETE RESTRICT to prevent accidental deletion
-- of categories that contain active fleet inventory.
--
-- RLS:
--   - vehicle_categories: Public SELECT on active rows; tenant members manage.
--   - vehicles: Private to tenant staff (is_entity_member). Public never reads
--     physical vehicle assets directly.

BEGIN;

-- ── 1. Generic updated_at trigger for rental engine ───────────────────────────

CREATE OR REPLACE FUNCTION public.update_rental_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. public.vehicle_categories ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 100),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  daily_rate numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (daily_rate >= 0),
  weekly_rate numeric(12,2) NULL CHECK (weekly_rate IS NULL OR weekly_rate >= 0),
  deposit_amount numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (deposit_amount >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  specs jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(specs) = 'object'),
  photo_url text CHECK (photo_url IS NULL OR char_length(photo_url) <= 2048),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, slug)
);

COMMENT ON TABLE public.vehicle_categories IS 'Vehicle rental categories and rate plans, tenant-scoped to organizers.id and businesses.id.';
COMMENT ON COLUMN public.vehicle_categories.specs IS 'Vehicle category technical specifications: seats, transmission, doors, luggage, ac.';

CREATE INDEX IF NOT EXISTS idx_vehicle_categories_org ON public.vehicle_categories(organizer_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_categories_business ON public.vehicle_categories(business_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_categories_active ON public.vehicle_categories(business_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vehicle_categories_sort ON public.vehicle_categories(business_id, sort_order ASC);

DROP TRIGGER IF EXISTS trg_vehicle_categories_updated_at ON public.vehicle_categories;
CREATE TRIGGER trg_vehicle_categories_updated_at
  BEFORE UPDATE ON public.vehicle_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_rental_updated_at();

-- ── 3. public.vehicles ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.vehicle_categories(id) ON DELETE RESTRICT,
  branch_id uuid NULL REFERENCES public.business_branches(id) ON DELETE SET NULL,
  make text NOT NULL CHECK (char_length(trim(make)) >= 1 AND char_length(make) <= 60),
  model text NOT NULL CHECK (char_length(trim(model)) >= 1 AND char_length(model) <= 60),
  year integer NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  license_plate text NOT NULL CHECK (char_length(trim(license_plate)) >= 1 AND char_length(license_plate) <= 20),
  vin text NULL CHECK (vin IS NULL OR (char_length(trim(vin)) >= 5 AND char_length(vin) <= 25)),
  color text NULL CHECK (color IS NULL OR char_length(color) <= 40),
  current_mileage integer NOT NULL DEFAULT 0 CHECK (current_mileage >= 0),
  fuel_type text NOT NULL DEFAULT 'gasoline' CHECK (fuel_type IN ('gasoline', 'diesel', 'electric', 'hybrid')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'out_of_service')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, license_plate)
);

COMMENT ON TABLE public.vehicles IS 'Physical vehicle fleet units, tenant-scoped to organizers.id and businesses.id, stationed at branches.';
COMMENT ON COLUMN public.vehicles.status IS 'Current operational status: available, rented, maintenance, out_of_service. Stored for dispatch performance, system-reconciled.';

CREATE INDEX IF NOT EXISTS idx_vehicles_org ON public.vehicles(organizer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_business ON public.vehicles(business_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON public.vehicles(category_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_branch ON public.vehicles(branch_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(organizer_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON public.vehicles(business_id, is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_rental_updated_at();

-- ── 4. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE public.vehicle_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- vehicle_categories policies
DROP POLICY IF EXISTS "Public can view active vehicle categories" ON public.vehicle_categories;
CREATE POLICY "Public can view active vehicle categories"
  ON public.vehicle_categories FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Tenant members can view vehicle categories" ON public.vehicle_categories;
CREATE POLICY "Tenant members can view vehicle categories"
  ON public.vehicle_categories FOR SELECT
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert vehicle categories" ON public.vehicle_categories;
CREATE POLICY "Tenant editors can insert vehicle categories"
  ON public.vehicle_categories FOR INSERT
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update vehicle categories" ON public.vehicle_categories;
CREATE POLICY "Tenant editors can update vehicle categories"
  ON public.vehicle_categories FOR UPDATE
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

DROP POLICY IF EXISTS "Tenant managers can delete vehicle categories" ON public.vehicle_categories;
CREATE POLICY "Tenant managers can delete vehicle categories"
  ON public.vehicle_categories FOR DELETE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- vehicles policies (private to tenant staff; no public select)
DROP POLICY IF EXISTS "Tenant members can view vehicles" ON public.vehicles;
CREATE POLICY "Tenant members can view vehicles"
  ON public.vehicles FOR SELECT
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert vehicles" ON public.vehicles;
CREATE POLICY "Tenant editors can insert vehicles"
  ON public.vehicles FOR INSERT
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update vehicles" ON public.vehicles;
CREATE POLICY "Tenant editors can update vehicles"
  ON public.vehicles FOR UPDATE
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

DROP POLICY IF EXISTS "Tenant managers can delete vehicles" ON public.vehicles;
CREATE POLICY "Tenant managers can delete vehicles"
  ON public.vehicles FOR DELETE
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
