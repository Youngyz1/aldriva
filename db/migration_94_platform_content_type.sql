-- migration_94_platform_content_type.sql
-- Allows About-Aldriva platform fallback content in ai_content_items.
-- Previously content_type was restricted to grounded verticals
-- ('event','fundraiser','business','article','product'). Platform content
-- has no originating record in those tables (uses the zero-UUID sentinel
-- as source_id), so it needs its own content_type value.

BEGIN;

ALTER TABLE ai_content_items
  DROP CONSTRAINT IF EXISTS ai_content_items_content_type_check;

ALTER TABLE ai_content_items
  ADD CONSTRAINT ai_content_items_content_type_check
  CHECK (content_type IN ('event', 'fundraiser', 'business', 'article', 'product', 'platform'));

COMMIT;

NOTIFY pgrst, 'reload schema';
