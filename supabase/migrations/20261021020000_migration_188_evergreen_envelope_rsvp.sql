BEGIN;
ALTER TABLE public.event_invitations
  ADD COLUMN IF NOT EXISTS rsvp_guest_count smallint,
  ADD COLUMN IF NOT EXISTS rsvp_guest_names text,
  ADD COLUMN IF NOT EXISTS rsvp_message text,
  ADD COLUMN IF NOT EXISTS guest_allowance smallint;
ALTER TABLE public.event_invitations DROP CONSTRAINT IF EXISTS event_invitations_rsvp_guest_count_check;
ALTER TABLE public.event_invitations DROP CONSTRAINT IF EXISTS event_invitations_guest_allowance_check;
ALTER TABLE public.event_invitations DROP CONSTRAINT IF EXISTS event_invitations_rsvp_guest_names_len_check;
ALTER TABLE public.event_invitations DROP CONSTRAINT IF EXISTS event_invitations_rsvp_message_len_check;
ALTER TABLE public.event_invitations
  ADD CONSTRAINT event_invitations_rsvp_guest_count_check CHECK (rsvp_guest_count IS NULL OR rsvp_guest_count BETWEEN 1 AND 20),
  ADD CONSTRAINT event_invitations_guest_allowance_check CHECK (guest_allowance IS NULL OR guest_allowance BETWEEN 1 AND 20),
  ADD CONSTRAINT event_invitations_rsvp_guest_names_len_check CHECK (rsvp_guest_names IS NULL OR char_length(rsvp_guest_names) <= 300),
  ADD CONSTRAINT event_invitations_rsvp_message_len_check CHECK (rsvp_message IS NULL OR char_length(rsvp_message) <= 500);
COMMIT;
