-- scripts/cleanup/website-post-delete-verify.sql
--
-- STAGE S2 post-delete verification (SELECT-ONLY).
-- After the COMMITTED delete run, every query below must return 0 rows for
-- the removed website ids / tenant prefixes. Replace the id lists with the
-- same ids used in website-test-delete.sql.

-- === HUMAN STEP: same verified test website ids as the delete script ===
WITH doomed(website_id) AS (
  VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid) -- placeholder: REPLACE ME
)
SELECT 'tenant_websites' AS tbl, COUNT(*) AS leftover
FROM public.tenant_websites tw JOIN doomed d ON d.website_id = tw.id
UNION ALL
SELECT 'website_pages', COUNT(*)
FROM public.website_pages wp JOIN doomed d ON d.website_id = wp.website_id
UNION ALL
SELECT 'website_navigation', COUNT(*)
FROM public.website_navigation wn JOIN doomed d ON d.website_id = wn.website_id
UNION ALL
SELECT 'website_page_drafts', COUNT(*)
FROM public.website_page_drafts wpd
JOIN public.website_pages wp ON wp.id = wpd.page_id
JOIN doomed d ON d.website_id = wp.website_id
UNION ALL
SELECT 'website_content', COUNT(*)
FROM public.website_content wc JOIN doomed d ON d.website_id = wc.website_id
UNION ALL
SELECT 'website_content_drafts', COUNT(*)
FROM public.website_content_drafts wcd JOIN doomed d ON d.website_id = wcd.website_id;

-- Storage: rerun per-prefix listing from website-storage-inventory.sql;
-- expect 0 objects under each removed <tenant_id>/ prefix.
