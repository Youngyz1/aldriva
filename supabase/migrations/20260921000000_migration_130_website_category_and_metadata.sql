-- migration_130_website_category_and_metadata.sql
-- Stage C: Website category persistence and template metadata foundation

BEGIN;

ALTER TABLE public.tenant_websites
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenant_websites.metadata IS 'Lightweight per-website metadata (websiteCategory, templateId/templateVersion, etc.). Application-level, not a full taxonomy. Stage C foundation for template compatibility filtering.';

CREATE INDEX IF NOT EXISTS idx_tenant_websites_metadata_category
  ON public.tenant_websites USING GIN (metadata);

COMMIT;

NOTIFY pgrst, 'reload schema';
