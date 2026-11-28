-- Migration 212: Scan Code Registry (Phase 2 — issuance only)
-- Phase: Guest/Staff Scanner — scan code registry for receipt barcodes
-- Additive only. No existing table is altered. One transaction, idempotent
-- (CREATE ... IF NOT EXISTS / CREATE OR REPLACE throughout).
--
-- Scope: this migration only lets a backend caller mint and resolve random,
-- typed scan codes for orders (O1-) and reservations (R1-). It performs NO
-- scan action (no pick-up, deliver, seat, ...) — that is a later phase.
-- Codes are never derived from order_number, tracking_token or lookup_token:
-- they are independent, randomly generated identifiers so a printed receipt
-- barcode reveals nothing about — and cannot be reconstructed from — the
-- customer-facing tracking/lookup tokens.
--
-- Rollback notes (see db/migration_212_scan_codes_rollback.sql):
--   - The rollback refuses to run while any public.scan_codes row exists,
--     because a printed receipt barcode for a deleted code becomes
--     permanently unscannable. Revoke/delete rows deliberately first.
--   - The rollback drops public.lookup_scan_code, public.issue_scan_code,
--     public.generate_scan_code_body, and public.scan_codes. It never
--     touches public.orders or public.reservations (no columns were added
--     to either table by this migration).

BEGIN;

-- ── 1. Extension ──────────────────────────────────────────────────────────
-- Already ensured by migration 198, but idempotent here too in case this
-- migration is ever applied standalone to an older baseline.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 2. public.scan_codes ─────────────────────────────────────────────────
-- One row per issued code. subject_id is a generated convenience column so
-- callers can look up "the subject" without branching on code_type first.
CREATE TABLE IF NOT EXISTS public.scan_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  code_type text NOT NULL CHECK (code_type IN ('order', 'reservation')),
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reservation_id uuid NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  subject_id uuid GENERATED ALWAYS AS (coalesce(order_id, reservation_id)) STORED,
  tenant_id uuid NOT NULL,
  business_id uuid NULL,
  -- Stays NULL until Phase 3 wires branch-scoped issuance/resolution.
  branch_id uuid NULL REFERENCES public.business_branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT scan_codes_exactly_one_subject CHECK (num_nonnulls(order_id, reservation_id) = 1),
  CONSTRAINT scan_codes_subject_matches_type CHECK (
    (code_type = 'order' AND order_id IS NOT NULL AND reservation_id IS NULL)
    OR (code_type = 'reservation' AND reservation_id IS NOT NULL AND order_id IS NULL)
  ),
  -- Crockford base32 without I, L, O, U — see generate_scan_code_body().
  CONSTRAINT scan_codes_code_format CHECK (code ~ '^(O1|R1)-[0-9A-HJKMNP-TV-Z]{16}$'),
  CONSTRAINT scan_codes_code_prefix_matches_type CHECK (
    (code_type = 'order' AND code LIKE 'O1-%')
    OR (code_type = 'reservation' AND code LIKE 'R1-%')
  )
);

-- One code per subject (idempotent issuance relies on this).
CREATE UNIQUE INDEX IF NOT EXISTS scan_codes_order_id_unique
  ON public.scan_codes(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS scan_codes_reservation_id_unique
  ON public.scan_codes(reservation_id) WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scan_codes_tenant_id
  ON public.scan_codes(tenant_id);

-- ── 3. RLS: service_role only, no policies ──────────────────────────────
ALTER TABLE public.scan_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scan_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_codes TO service_role;

-- ── 4. Code body generator ───────────────────────────────────────────────
-- 16 random bytes, each byte masked with 31 (0x1F) to index a 32-character
-- alphabet: uniform, no modulo bias, 5 bits per character, 80 bits total.
CREATE OR REPLACE FUNCTION public.generate_scan_code_body()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(16);
  v_result text := '';
  v_i int;
BEGIN
  FOR v_i IN 0..15 LOOP
    v_result := v_result || substr(v_alphabet, (get_byte(v_bytes, v_i) & 31) + 1, 1);
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_scan_code_body() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_scan_code_body() TO service_role;

-- ── 5. public.issue_scan_code ─────────────────────────────────────────────
-- Idempotent: returns the existing code for a subject if one was already
-- issued (out_created = false), otherwise inserts a freshly generated code
-- with a bounded retry loop on a global code collision, and re-selects on
-- the per-subject unique-index race instead of raising. Never raises for a
-- business rule (unknown subject, bad code_type): returns zero rows.
CREATE OR REPLACE FUNCTION public.issue_scan_code(
  p_code_type text,
  p_subject_id uuid
)
RETURNS TABLE (
  out_code text,
  out_code_type text,
  out_status text,
  out_created boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
  v_prefix text;
  v_tenant_id uuid;
  v_business_id uuid;
  v_order public.orders%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_existing record;
  v_code text;
  v_attempt int;
  v_constraint_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_code_type IS NULL OR p_code_type NOT IN ('order', 'reservation') OR p_subject_id IS NULL THEN
    RETURN;
  END IF;

  IF p_code_type = 'order' THEN
    v_prefix := 'O1';
    SELECT * INTO v_order FROM public.orders WHERE id = p_subject_id;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    v_tenant_id := v_order.organizer_id;
    v_business_id := v_order.business_id;

    SELECT code, code_type, status INTO v_existing
      FROM public.scan_codes WHERE order_id = p_subject_id;
  ELSE
    v_prefix := 'R1';
    SELECT * INTO v_reservation FROM public.reservations WHERE id = p_subject_id;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    v_tenant_id := v_reservation.organizer_id;
    v_business_id := v_reservation.business_id;

    SELECT code, code_type, status INTO v_existing
      FROM public.scan_codes WHERE reservation_id = p_subject_id;
  END IF;

  IF FOUND THEN
    out_code := v_existing.code;
    out_code_type := v_existing.code_type;
    out_status := v_existing.status;
    out_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_attempt IN 1..5 LOOP
    BEGIN
      v_code := v_prefix || '-' || public.generate_scan_code_body();

      INSERT INTO public.scan_codes (code, code_type, order_id, reservation_id, tenant_id, business_id)
      VALUES (
        v_code,
        p_code_type,
        CASE WHEN p_code_type = 'order' THEN p_subject_id ELSE NULL END,
        CASE WHEN p_code_type = 'reservation' THEN p_subject_id ELSE NULL END,
        v_tenant_id,
        v_business_id
      )
      RETURNING code, code_type, status INTO v_existing;

      out_code := v_existing.code;
      out_code_type := v_existing.code_type;
      out_status := v_existing.status;
      out_created := true;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

      IF v_constraint_name = 'scan_codes_code_key' AND v_attempt < 5 THEN
        -- Collision on the random code itself; retry with a fresh one.
        CONTINUE;
      ELSIF v_constraint_name IN ('scan_codes_order_id_unique', 'scan_codes_reservation_id_unique') THEN
        -- Race: a concurrent call issued this subject's code first.
        -- Re-select and return it instead of raising.
        IF p_code_type = 'order' THEN
          SELECT code, code_type, status INTO v_existing
            FROM public.scan_codes WHERE order_id = p_subject_id;
        ELSE
          SELECT code, code_type, status INTO v_existing
            FROM public.scan_codes WHERE reservation_id = p_subject_id;
        END IF;

        IF FOUND THEN
          out_code := v_existing.code;
          out_code_type := v_existing.code_type;
          out_status := v_existing.status;
          out_created := false;
          RETURN NEXT;
        END IF;
        RETURN;
      ELSE
        RETURN;
      END IF;
    END;
  END LOOP;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_scan_code(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_scan_code(text, uuid) TO service_role;

-- ── 6. public.lookup_scan_code ────────────────────────────────────────────
-- Returns identifiers and statuses ONLY: never a customer name, email,
-- phone, address or items. Used to resolve a scanned string to its subject.
CREATE OR REPLACE FUNCTION public.lookup_scan_code(p_code text)
RETURNS TABLE (
  out_code_type text,
  out_subject_id uuid,
  out_tenant_id uuid,
  out_business_id uuid,
  out_branch_id uuid,
  out_status text,
  out_subject_number text,
  out_subject_status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
  v_row record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR p_code !~ '^(O1|R1)-[0-9A-HJKMNP-TV-Z]{16}$' THEN
    RETURN;
  END IF;

  SELECT sc.code_type, sc.subject_id, sc.tenant_id, sc.business_id, sc.branch_id, sc.status
    INTO v_row
    FROM public.scan_codes sc
   WHERE sc.code = p_code;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  out_code_type := v_row.code_type;
  out_subject_id := v_row.subject_id;
  out_tenant_id := v_row.tenant_id;
  out_business_id := v_row.business_id;
  out_branch_id := v_row.branch_id;
  out_status := v_row.status;

  IF v_row.code_type = 'order' THEN
    SELECT o.order_number, o.status INTO out_subject_number, out_subject_status
      FROM public.orders o WHERE o.id = v_row.subject_id;
  ELSE
    SELECT r.reservation_number, r.status INTO out_subject_number, out_subject_status
      FROM public.reservations r WHERE r.id = v_row.subject_id;
  END IF;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_scan_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_scan_code(text) TO service_role;

COMMIT;
