-- migration_234_unified_template_page_only_rollback.sql
-- Rollback for migration_234_unified_template_page_only.sql.
-- Restores set_unified_invitation_template to its exact previous body
-- (migration_163_unified_template_rpc.sql) — the unconditional
-- card-existence check, with no NULL branch. Does not touch any data: any
-- event already written with a NULL invitation_template_id via a page-only
-- pair keeps that value (selection state, not derived state); it simply
-- cannot be set that way again through this function until migration_223
-- is re-applied. Safe to re-run.

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
