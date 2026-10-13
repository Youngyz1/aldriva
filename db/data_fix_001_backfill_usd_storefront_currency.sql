-- data_fix_001_backfill_usd_storefront_currency.sql
--
-- ONE-OFF DATA FIX — NOT A MIGRATION. DO NOT RUN via migration tooling.
-- Review required; run manually after confirming the SELECT preview below.
--
-- Purpose (Phase 3, Step 1.3): production site "ams-bidjan" (and any sibling
-- site) has metadata.storefront.currency = NULL with a US business, so its
-- currency resolves to USD only through the country fallback. Make the USD
-- explicit so the online-payment currency gate reads a stored value.
--
-- Scope: tenant_websites rows where metadata.storefront.currency IS NULL AND
-- the earliest linked business (same rule as the app resolver) currently
-- resolves to USD — i.e. no business, a NULL country, or a non-CI country.
-- Sites resolving to XOF (Côte d'Ivoire / Ivory Coast / CI business) are
-- NEVER touched.
--
-- Idempotent: re-running only rewrites the same '"USD"' value; rows already
-- carrying a currency are excluded by the WHERE clause.
--
-- Preview first:
--   SELECT tw.id, tw.slug, tw.metadata->'storefront' AS storefront, biz.country
--   FROM tenant_websites tw
--   LEFT JOIN LATERAL (
--     SELECT b.country FROM businesses b
--     WHERE b.organizer_id = tw.tenant_id
--     ORDER BY b.created_at ASC LIMIT 1
--   ) biz ON true
--   WHERE tw.metadata->'storefront'->>'currency' IS NULL;

UPDATE tenant_websites tw
SET metadata = jsonb_set(tw.metadata, '{storefront,currency}', '"USD"', true)
FROM LATERAL (
  SELECT b.country
  FROM businesses b
  WHERE b.organizer_id = tw.tenant_id
  ORDER BY b.created_at ASC
  LIMIT 1
) biz
WHERE tw.metadata->'storefront'->>'currency' IS NULL
  AND (
    biz.country IS NULL
    OR translate(
      lower(trim(biz.country)),
      'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ',
      'aaaaaaeeeeiiiiooooouuuuycn'
    ) NOT IN ('cote d''ivoire', 'ivory coast', 'ci')
  );
