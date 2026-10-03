-- migration_125_tenant_websites_rollback.sql
-- Rollback for Phase 1: Business Website Foundation

BEGIN;

-- 1. Drop RLS policies
DROP POLICY IF EXISTS "Public can view website navigation for published websites" ON website_navigation;
DROP POLICY IF EXISTS "Tenant managers and editors can manage website navigation" ON website_navigation;

DROP POLICY IF EXISTS "Public can view published website pages" ON website_pages;
DROP POLICY IF EXISTS "Tenant managers and editors can manage website pages" ON website_pages;

DROP POLICY IF EXISTS "Public can view published tenant websites" ON tenant_websites;
DROP POLICY IF EXISTS "Tenant managers and editors can manage tenant websites" ON tenant_websites;

-- 2. Drop triggers and trigger functions
DROP TRIGGER IF EXISTS trg_website_navigation_updated_at ON website_navigation;
DROP FUNCTION IF EXISTS update_website_navigation_updated_at();

DROP TRIGGER IF EXISTS trg_website_pages_updated_at ON website_pages;
DROP FUNCTION IF EXISTS update_website_pages_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_websites_updated_at ON tenant_websites;
DROP FUNCTION IF EXISTS update_tenant_websites_updated_at();

-- 3. Drop tables in reverse dependency order
DROP TABLE IF EXISTS website_navigation CASCADE;
DROP TABLE IF EXISTS website_pages CASCADE;
DROP TABLE IF EXISTS tenant_websites CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
