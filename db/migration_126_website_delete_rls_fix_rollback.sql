-- migration_126_website_delete_rls_fix_rollback.sql
-- Rollback for migration 126: restores unified FOR ALL policies on tenant_websites, website_pages, website_navigation.

BEGIN;

-- 1. Rollback tenant_websites
DROP POLICY IF EXISTS "Tenant members can view tenant websites" ON tenant_websites;
DROP POLICY IF EXISTS "Tenant managers and editors can insert tenant websites" ON tenant_websites;
DROP POLICY IF EXISTS "Tenant managers and editors can update tenant websites" ON tenant_websites;
DROP POLICY IF EXISTS "Tenant managers can delete tenant websites" ON tenant_websites;

CREATE POLICY "Tenant managers and editors can manage tenant websites"
  ON tenant_websites
  FOR ALL
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

-- 2. Rollback website_pages
DROP POLICY IF EXISTS "Tenant members can view website pages" ON website_pages;
DROP POLICY IF EXISTS "Tenant managers and editors can insert website pages" ON website_pages;
DROP POLICY IF EXISTS "Tenant managers and editors can update website pages" ON website_pages;
DROP POLICY IF EXISTS "Tenant managers can delete website pages" ON website_pages;

CREATE POLICY "Tenant managers and editors can manage website pages"
  ON website_pages
  FOR ALL
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

-- 3. Rollback website_navigation
DROP POLICY IF EXISTS "Tenant members can view website navigation" ON website_navigation;
DROP POLICY IF EXISTS "Tenant managers and editors can insert website navigation" ON website_navigation;
DROP POLICY IF EXISTS "Tenant managers and editors can update website navigation" ON website_navigation;
DROP POLICY IF EXISTS "Tenant managers can delete website navigation" ON website_navigation;

CREATE POLICY "Tenant managers and editors can manage website navigation"
  ON website_navigation
  FOR ALL
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

COMMIT;

NOTIFY pgrst, 'reload schema';
