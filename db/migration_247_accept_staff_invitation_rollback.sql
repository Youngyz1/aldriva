-- Rollback for 247. Idempotent and all-or-nothing: one DO block, so a failed guard
-- changes nothing. Refuses while any invitation has a phone or no email.
DO $$
DECLARE v_has_data boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='staff_invitations' AND column_name='phone') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.staff_invitations WHERE phone IS NOT NULL OR email IS NULL)'
      INTO v_has_data;
    IF v_has_data THEN
      RAISE EXCEPTION 'invitations with a phone or without an email exist; resolve them before rolling back 247';
    END IF;
  END IF;
  DROP FUNCTION IF EXISTS public.accept_staff_invitation(uuid);
  DROP FUNCTION IF EXISTS public.staff_invitee_phone_matches(text);
  ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_contact_check;
  ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_channel_check;
  ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_phone_check;
  DROP INDEX IF EXISTS public.idx_staff_invitations_phone;
  ALTER TABLE public.staff_invitations DROP COLUMN IF EXISTS phone;
  ALTER TABLE public.staff_invitations DROP COLUMN IF EXISTS delivery_channel;
  ALTER TABLE public.staff_invitations ALTER COLUMN email SET NOT NULL;
END;
$$;