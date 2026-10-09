-- migration_163_unified_template_rpc.sql
-- Round 5, step 2: atomic unified template selection.
--
-- One organizer selection writes BOTH invitation variants. Two sequential
-- writes are not a transaction (a failed second write would leave the card
-- new and the page old, and a compensating rollback can itself fail), so
-- both writes live in a single SECURITY DEFINER function: either both
-- columns land or neither does — there is no partial-failure path.
-- Precedent: migration_131_create_website_from_template (same hardening).
--
-- Function: set_unified_invitation_template(p_event_id, p_card_template_id,
-- p_page_template_id):
-- 1. Guards: event must exist and be kind='invitation' (DB-level mirror of
--    the app's assertInvitationKindEvent — defense in depth for any future
--    caller that skips the app gate); card id must be an active
--    invitation_templates row. Page ids are code-registry values validated
--    in the app (no page table exists to check against).
-- 2. Writes: events.invitation_template_id + upsert of
--    event_invitation_pages.template_id (creates the draft row with column
--    defaults when the event has no page row yet, e.g. older card-only
--    drafts). Only these two columns are touched — content, status, and
--    snapshots are never modified here.
--
-- Execution: service_role only (called via supabaseAdmin.rpc after the app
-- authorizes access + kind). REVOKE ALL FROM PUBLIC, anon, authenticated.
-- Safe to re-run (CREATE OR REPLACE + unconditional REVOKE/GRANT).
-- Rollback: db/migration_163_unified_template_rpc_rollback.sql

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

  IF NOT EXISTS (
    SELECT 1 FROM public.invitation_templates
    WHERE id = p_card_template_id AND is_active
  ) THEN
    RAISE EXCEPTION 'UNKNOWN_CARD_TEMPLATE';
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
