-- migration_234_unified_template_page_only.sql
-- Allows set_unified_invitation_template to accept a page-only pair (no
-- card template) so a page template can be offered in the unified builder
-- picker before a matching card row exists. Builds on migration_163
-- (db/migration_163_unified_template_rpc.sql), the latest definition of
-- this function as of this migration — grepped db/ and supabase/migrations/
-- for every "set_unified_invitation_template" and "unified_template" hit;
-- migration_163 is the only one.
--
-- Behavior change: when p_card_template_id IS NULL, the card-existence
-- check (UNKNOWN_CARD_TEMPLATE) is skipped and events.invitation_template_id
-- is left NULL. When p_card_template_id IS NOT NULL, behavior is byte-for-
-- byte identical to migration_163 — it still must be an active
-- invitation_templates row or the function still raises
-- UNKNOWN_CARD_TEMPLATE. Signature, SECURITY DEFINER, search_path, and
-- grants are all unchanged from migration_163.
--
-- PRE-FLIGHT VERIFICATION QUERIES:
-- Run these queries prior to applying the migration to preview current state:
--
-- 1. View the function definition this migration replaces (confirm it still
--    matches migration_163's body before applying):
--    SELECT pg_get_functiondef('public.set_unified_invitation_template(uuid, uuid, text)'::regprocedure);
--
-- 2. Count events already relying on a NULL card (informational only — this
--    migration does not touch existing rows, only future RPC calls):
--    SELECT count(*) FROM public.events WHERE invitation_template_id IS NULL AND kind = 'invitation';
--
-- VERIFICATION QUERIES (run after applying):
--
-- 3. Confirm the new NULL branch is present in the replaced function body:
--    SELECT pg_get_functiondef('public.set_unified_invitation_template(uuid, uuid, text)'::regprocedure)
--      LIKE '%p_card_template_id IS NOT NULL%';
--    -- expect: true
--
-- 4. Confirm grants are unchanged (service_role only):
--    SELECT grantee, privilege_type
--    FROM information_schema.role_routine_grants
--    WHERE routine_name = 'set_unified_invitation_template';
--    -- expect: exactly one row, grantee = service_role, privilege_type = EXECUTE
--
-- Rollback twin: db/migration_234_unified_template_page_only_rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.set_unified_invitation_template(
  p_event_id UUID,
  p_card_template_id UUID,
  p_page_template_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind TEXT;
BEGIN
  SELECT kind INTO v_kind FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;
  IF v_kind IS DISTINCT FROM 'invitation' THEN
    RAISE EXCEPTION 'NOT_INVITATION_KIND';
  END IF;

  -- A page-only pair (p_card_template_id IS NULL) carries no card: skip the
  -- card-existence check. A non-null id behaves exactly as before — it
  -- must be an active invitation_templates row.
  IF p_card_template_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.invitation_templates
      WHERE id = p_card_template_id AND is_active
    ) THEN
      RAISE EXCEPTION 'UNKNOWN_CARD_TEMPLATE';
    END IF;
  END IF;

  UPDATE public.events
  SET invitation_template_id = p_card_template_id
  WHERE id = p_event_id;

  INSERT INTO public.event_invitation_pages (event_id, template_id)
  VALUES (p_event_id, p_page_template_id)
  ON CONFLICT (event_id) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_unified_invitation_template(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_unified_invitation_template(UUID, UUID, TEXT)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
