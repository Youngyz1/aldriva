-- migration_130_website_category_and_metadata.sql
-- Stage C: Website category persistence and template metadata foundation
--
-- Adds application-level metadata storage for tenant websites without
-- creating a separate business taxonomy or a template mirror table.
--
-- - metadata JSONB column on tenant_websites stores:
--   - websiteCategory: WebsiteCategory (business/restaurant/retail/service/...)
--   - templateId/templateVersion (for future instantiation lifecycle Stage E)
--   - any lightweight per-website hints required before full template snapshot
--
-- No RLS changes required — inherits existing tenant_websites policies.
-- No data backfill — existing rows keep default '{}'.

BEGIN;

ALTER TABLE public.tenant_websites
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenant_websites.metadata IS 'Lightweight per-website metadata (websiteCategory, templateId/templateVersion, etc.). Application-level, not a full taxonomy. Stage C foundation for template compatibility filtering.';

-- Optional index for filtering by category if needed (GIN on JSONB)
CREATE INDEX IF NOT EXISTS idx_tenant_websites_metadata_category
  ON public.tenant_websites USING GIN (metadata);

COMMIT;

NOTIFY pgrst, 'reload schema';
