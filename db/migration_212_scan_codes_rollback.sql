-- Rollback for Migration 212: Scan Code Registry
-- Refuses to run while any public.scan_codes row exists: a printed receipt
-- barcode for a deleted code would become permanently unscannable. Revoke
-- or delete rows deliberately before retrying this rollback.
-- Does not touch public.orders or public.reservations — migration 212 adds
-- no columns to either table.

BEGIN;

-- ── 1. Guard against in-use codes ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scan_codes) THEN
    RAISE EXCEPTION
      'MIGRATION_212_ROLLBACK_BLOCKED: scan_codes has rows; printed receipt barcodes would become unscannable. Revoke/delete them deliberately before retrying.';
  END IF;
END;
$$;

-- ── 2. Drop functions ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.lookup_scan_code(text) FROM service_role;
REVOKE ALL ON FUNCTION public.issue_scan_code(text, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.generate_scan_code_body() FROM service_role;

DROP FUNCTION IF EXISTS public.lookup_scan_code(text);
DROP FUNCTION IF EXISTS public.issue_scan_code(text, uuid);
DROP FUNCTION IF EXISTS public.generate_scan_code_body();

-- ── 3. Drop table ─────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.scan_codes;

COMMIT;
