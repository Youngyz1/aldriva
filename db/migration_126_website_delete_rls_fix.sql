-- migration_126_website_delete_rls_fix.sql
-- Tightens DELETE permissions on tenant_websites, website_pages, and website_navigation.
-- Splits legacy FOR ALL policies so that:
-- - SELECT: members (all roles) + public (published only)
-- - INSERT & UPDATE: owner, admin, manager, editor (ENTITY_ROLES_CONTENT_WRITE)
-- - DELETE: owner, admin, manager ONLY (ENTITY_ROLES_MANAGE, excluding editor)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TENANT_WEBSITES RLS SPLIT
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop legacy broad management policy
DROP POLICY IF EXISTS "Tenant managers and editors can manage tenant websites" ON tenant_websites;

-- Tenant members can view their website in any status (draft, published, archived)
CREATE POLICY "Tenant members can view tenant websites"
  ON tenant_websites
  FOR SELECT
  TO authenticated
  USING (
    is_entity_member(tenant_id, ARRAY['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'])
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
      )
    )
  );

-- Editors and managers can create new tenant websites
CREATE POLICY "Tenant managers and editors can insert tenant websites"
  ON tenant_websites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_entity_member(tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
      )
    )
  );

-- Editors and managers can update website settings and branding
CREATE POLICY "Tenant managers and editors can update tenant websites"
  ON tenant_websites
  FOR UPDATE
  TO authenticated
  USING (
    is_entity_member(tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
      )
    )
  )
  WITH CHECK (
    is_entity_member(tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
      )
    )
  );

-- Only owners, admins, and managers can delete tenant websites (destructive)
CREATE POLICY "Tenant managers can delete tenant websites"
  ON tenant_websites
  FOR DELETE
  TO authenticated
  USING (
    is_entity_member(tenant_id, ARRAY['owner', 'admin', 'manager'])
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
      )
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. WEBSITE_PAGES RLS SPLIT
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop legacy broad management policy
DROP POLICY IF EXISTS "Tenant managers and editors can manage website pages" ON website_pages;

-- Tenant members can view all pages for their website
CREATE POLICY "Tenant members can view website pages"
  ON website_pages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_pages.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

-- Editors and managers can create pages
CREATE POLICY "Tenant managers and editors can insert website pages"
  ON website_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_pages.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

-- Editors and managers can update page content and metadata
CREATE POLICY "Tenant managers and editors can update website pages"
  ON website_pages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_pages.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_pages.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

-- Only owners, admins, and managers can delete pages (destructive)
CREATE POLICY "Tenant managers can delete website pages"
  ON website_pages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_pages.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WEBSITE_NAVIGATION RLS SPLIT
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop legacy broad management policy
DROP POLICY IF EXISTS "Tenant managers and editors can manage website navigation" ON website_navigation;

-- Tenant members can view navigation in any state
CREATE POLICY "Tenant members can view website navigation"
  ON website_navigation
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_navigation.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

-- Editors and managers can insert navigation entries
CREATE POLICY "Tenant managers and editors can insert website navigation"
  ON website_navigation
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_navigation.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

-- Editors and managers can update navigation menus
CREATE POLICY "Tenant managers and editors can update website navigation"
  ON website_navigation
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_navigation.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_navigation.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager', 'editor'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

-- Only owners, admins, and managers can delete navigation containers (destructive)
CREATE POLICY "Tenant managers can delete website navigation"
  ON website_navigation
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_websites tw
      WHERE tw.id = website_navigation.website_id
        AND (
          is_entity_member(tw.tenant_id, ARRAY['owner', 'admin', 'manager'])
          OR (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
                AND role = 'admin'
                AND status = 'active'
            )
          )
        )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
