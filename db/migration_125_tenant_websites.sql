-- migration_125_tenant_websites.sql
-- Phase 1: Business Website Foundation
-- Introduces core schema for multi-page customizable business websites
-- anchored directly to canonical entity (organizers.id).

BEGIN;

-- 1. Create tenant_websites table
CREATE TABLE IF NOT EXISTS tenant_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES organizers(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  site_title TEXT NOT NULL,
  site_tagline TEXT,
  theme_config JSONB NOT NULL DEFAULT '{"theme": "default", "primaryColor": "#ea580c", "fontFamily": "sans", "borderRadius": "xl", "darkMode": false}'::jsonb,
  header_config JSONB NOT NULL DEFAULT '{"showLogo": true, "showNav": true, "showCta": true, "ctaLabel": "Get in Touch", "ctaHref": "/contact", "sticky": true}'::jsonb,
  footer_config JSONB NOT NULL DEFAULT '{"showSocials": true, "copyrightText": "", "showPoweredBy": true, "customLinks": []}'::jsonb,
  seo_title TEXT,
  seo_description TEXT,
  seo_og_image TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_websites IS 'Tenant-level website settings and theme configuration. tenant_id = organizers.id (canonical Entity).';

CREATE INDEX IF NOT EXISTS idx_tenant_websites_tenant_id ON tenant_websites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_websites_slug ON tenant_websites(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_websites_status ON tenant_websites(status);

-- 2. Create website_pages table
CREATE TABLE IF NOT EXISTS website_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES tenant_websites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_home BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  seo_og_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, slug)
);

COMMENT ON TABLE website_pages IS 'Pages belonging to a tenant website with modular block payloads.';

CREATE INDEX IF NOT EXISTS idx_website_pages_website_id ON website_pages(website_id);
CREATE INDEX IF NOT EXISTS idx_website_pages_sort ON website_pages(website_id, sort_order ASC, created_at ASC);

-- Partial unique index ensuring exactly one home page per website
CREATE UNIQUE INDEX IF NOT EXISTS uq_website_pages_single_home
  ON website_pages(website_id)
  WHERE is_home = true;

-- 3. Create website_navigation table
-- Navigation item JSON structure (flat or nested hierarchy):
-- Array of { "id": string, "label": string, "href": string, "page_id": string | null, "target": "_self" | "_blank", "order": number, "children": NavigationItem[] }
CREATE TABLE IF NOT EXISTS website_navigation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL UNIQUE REFERENCES tenant_websites(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE website_navigation IS 'Navigation menu tree for a tenant website.';

CREATE INDEX IF NOT EXISTS idx_website_navigation_website_id ON website_navigation(website_id);

-- 4. Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_tenant_websites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_websites_updated_at ON tenant_websites;
CREATE TRIGGER trg_tenant_websites_updated_at
  BEFORE UPDATE ON tenant_websites
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_websites_updated_at();

CREATE OR REPLACE FUNCTION update_website_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_website_pages_updated_at ON website_pages;
CREATE TRIGGER trg_website_pages_updated_at
  BEFORE UPDATE ON website_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_website_pages_updated_at();

CREATE OR REPLACE FUNCTION update_website_navigation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_website_navigation_updated_at ON website_navigation;
CREATE TRIGGER trg_website_navigation_updated_at
  BEFORE UPDATE ON website_navigation
  FOR EACH ROW
  EXECUTE FUNCTION update_website_navigation_updated_at();

-- 5. Row Level Security (RLS)

-- 5A. tenant_websites RLS
ALTER TABLE tenant_websites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published tenant websites" ON tenant_websites;
CREATE POLICY "Public can view published tenant websites"
  ON tenant_websites FOR SELECT
  USING (
    status = 'published'
    OR is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers and editors can manage tenant websites" ON tenant_websites;
CREATE POLICY "Tenant managers and editors can manage tenant websites"
  ON tenant_websites FOR ALL
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- 5B. website_pages RLS
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published website pages" ON website_pages;
CREATE POLICY "Public can view published website pages"
  ON website_pages FOR SELECT
  USING (
    (
      status = 'published'
      AND EXISTS (
        SELECT 1 FROM tenant_websites
        WHERE tenant_websites.id = website_pages.website_id
          AND tenant_websites.status = 'published'
      )
    )
    OR EXISTS (
      SELECT 1 FROM tenant_websites
      WHERE tenant_websites.id = website_pages.website_id
        AND (
          is_entity_member(tenant_websites.tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Tenant managers and editors can manage website pages" ON website_pages;
CREATE POLICY "Tenant managers and editors can manage website pages"
  ON website_pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites
      WHERE tenant_websites.id = website_pages.website_id
        AND (
          is_entity_member(tenant_websites.tenant_id, ARRAY['owner','admin','manager','editor'])
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
      SELECT 1 FROM tenant_websites
      WHERE tenant_websites.id = website_pages.website_id
        AND (
          is_entity_member(tenant_websites.tenant_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- 5C. website_navigation RLS
ALTER TABLE website_navigation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view website navigation for published websites" ON website_navigation;
CREATE POLICY "Public can view website navigation for published websites"
  ON website_navigation FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites
      WHERE tenant_websites.id = website_navigation.website_id
        AND (
          tenant_websites.status = 'published'
          OR is_entity_member(tenant_websites.tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Tenant managers and editors can manage website navigation" ON website_navigation;
CREATE POLICY "Tenant managers and editors can manage website navigation"
  ON website_navigation FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites
      WHERE tenant_websites.id = website_navigation.website_id
        AND (
          is_entity_member(tenant_websites.tenant_id, ARRAY['owner','admin','manager','editor'])
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
      SELECT 1 FROM tenant_websites
      WHERE tenant_websites.id = website_navigation.website_id
        AND (
          is_entity_member(tenant_websites.tenant_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
