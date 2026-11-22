CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_active_user
  ON public.event_team_members USING btree (event_id, user_id)
  WHERE ((status = 'active'::text) AND (user_id IS NOT NULL));
