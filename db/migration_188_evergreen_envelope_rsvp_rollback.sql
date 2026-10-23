BEGIN;
ALTER TABLE public.event_invitations
  DROP CONSTRAINT IF EXISTS event_invitations_rsvp_guest_count_check,
  DROP CONSTRAINT IF EXISTS event_invitations_guest_allowance_check,
  DROP CONSTRAINT IF EXISTS event_invitations_rsvp_guest_names_len_check,
  DROP CONSTRAINT IF EXISTS event_invitations_rsvp_message_len_check;
ALTER TABLE public.event_invitations
  DROP COLUMN IF EXISTS rsvp_guest_count,
  DROP COLUMN IF EXISTS rsvp_guest_names,
  DROP COLUMN IF EXISTS rsvp_message,
  DROP COLUMN IF EXISTS guest_allowance;
COMMIT;
