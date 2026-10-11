-- scripts/cleanup/website-storage-inventory.sql
--
-- STAGE S2 storage inventory (SELECT-ONLY — safe to run anywhere).
-- Website builder media lives under cms-media/<tenant_id>/... (see
-- lib/media/my-media.ts). Website actions never delete storage objects, so
-- orphaned prefixes are expected after row deletion — record them here first.
--
-- Usage: psql <conn> -f scripts/cleanup/website-storage-inventory.sql
-- Replace the tenant ids with the ones confirmed as test data in
-- website-inventory.sql output.

-- Per-prefix object listing with sizes (repeat per test tenant_id):
-- SELECT name AS object_key,
--        (metadata->>'size')::bigint AS size_bytes,
--        created_at
-- FROM storage.objects
-- WHERE bucket_id = 'cms-media'
--   AND name LIKE '<tenant_id>/%'
-- ORDER BY name;

-- Aggregate sizes per tenant prefix (all tenants, largest first):
SELECT
  split_part(name, '/', 1) AS tenant_prefix,
  COUNT(*) AS object_count,
  SUM(((metadata->>'size')::bigint)) AS total_bytes
FROM storage.objects
WHERE bucket_id = 'cms-media'
GROUP BY split_part(name, '/', 1)
ORDER BY total_bytes DESC NULLS LAST;
