-- scripts/cleanup/website-inventory.sql
--
-- STAGE S2 test-site inventory (SELECT-ONLY — safe to run anywhere).
-- Lists every tenant website joined to its organizer, with page/draft counts.
-- A human must verify EVERY row is test data before running website-test-delete.sql.
--
-- Usage: psql <conn> -f scripts/cleanup/website-inventory.sql

SELECT
  tw.id AS website_id,
  tw.slug,
  tw.site_title,
  tw.status,
  tw.created_at,
  tw.tenant_id,
  o.name AS organizer_name,
  o.slug AS organizer_slug,
  (SELECT COUNT(*) FROM public.website_pages wp WHERE wp.website_id = tw.id) AS page_count,
  (SELECT COUNT(*) FROM public.website_page_drafts wpd
     JOIN public.website_pages wp2 ON wp2.id = wpd.page_id
    WHERE wp2.website_id = tw.id) AS page_draft_count,
  (SELECT COUNT(*) FROM public.website_navigation wn WHERE wn.website_id = tw.id) AS nav_count,
  (SELECT COUNT(*) FROM public.website_content wc WHERE wc.website_id = tw.id) AS content_count,
  (SELECT COUNT(*) FROM public.website_content_drafts wcd WHERE wcd.website_id = tw.id) AS content_draft_count
FROM public.tenant_websites tw
LEFT JOIN public.organizers o ON o.id = tw.tenant_id
ORDER BY tw.created_at;
