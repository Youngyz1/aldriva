-- migration_101_p0_rls_enforcement_rollback.sql
--
-- EMERGENCY ROLLBACK ONLY. Restores the pre-101 permissive policies and
-- therefore RE-OPENS the P0 F-03 holes (public INSERT, visibility bypass,
-- social-graph exposure). Prefer forward-fixing over rolling back.
--
-- NOTE: the organizer column grants are intentionally NOT reverted to a full
-- table grant here beyond restoring SELECT — re-run the pre-101 grant state
-- (GRANT SELECT ON organizers TO anon, authenticated) only if a revoked
-- column is proven to break a legitimate anon flow.

BEGIN;

-- EVENTS: restore blanket policies, drop tightened ones.
DROP POLICY IF EXISTS "Owners and admins can create events" ON public.events;
DROP POLICY IF EXISTS "Approved public events are readable" ON public.events;
DROP POLICY IF EXISTS "Owners can read their own events" ON public.events;
DROP POLICY IF EXISTS "Admins can read all events" ON public.events;
CREATE POLICY "Allow public insert" ON public.events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.events FOR SELECT USING (true);

-- FUNDRAISERS: restore prior insert/select policies.
DROP POLICY IF EXISTS "Authenticated owners can create fundraisers pending review" ON public.fundraisers;
DROP POLICY IF EXISTS "Published fundraisers are public" ON public.fundraisers;
DROP POLICY IF EXISTS "Owners can read their own fundraisers" ON public.fundraisers;
DROP POLICY IF EXISTS "Admins can read all fundraisers" ON public.fundraisers;
CREATE POLICY "Anyone can create a fundraiser pending review"
  ON public.fundraisers FOR INSERT WITH CHECK (status = 'pending_review');
CREATE POLICY "Allow public select" ON public.fundraisers FOR SELECT USING (true);
CREATE POLICY "Fundraisers are publicly readable" ON public.fundraisers FOR SELECT USING (true);

-- TICKETS: restore blanket policies, drop tightened ones.
DROP POLICY IF EXISTS "Event owners and admins can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Tickets of visible events are readable" ON public.tickets;
DROP POLICY IF EXISTS "Event owners and admins can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Event owners and admins can delete tickets" ON public.tickets;
CREATE POLICY "Allow public insert" ON public.tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.tickets FOR SELECT USING (true);

-- ORGANIZERS: restore blanket read + full table grant.
DROP POLICY IF EXISTS "Public organizers are readable" ON public.organizers;
DROP POLICY IF EXISTS "Admins can read all organizers" ON public.organizers;
CREATE POLICY "Public organizers are readable"
  ON public.organizers FOR SELECT
  USING ((visibility = 'public'::text) OR (auth.uid() = user_id));
CREATE POLICY "Public read organizers" ON public.organizers FOR SELECT USING (true);
GRANT SELECT ON public.organizers TO anon, authenticated;

-- MEDIA / UPDATES: restore blanket reads.
DROP POLICY IF EXISTS "Media of published fundraisers is readable" ON public.fundraiser_media;
DROP POLICY IF EXISTS "Owners can read their own fundraiser media" ON public.fundraiser_media;
CREATE POLICY "Fundraiser media is publicly readable" ON public.fundraiser_media FOR SELECT USING (true);
CREATE POLICY "Public can view fundraiser media" ON public.fundraiser_media FOR SELECT USING (true);
DROP POLICY IF EXISTS "Updates of published fundraisers are readable" ON public.fundraiser_updates;
DROP POLICY IF EXISTS "Owners can read their own fundraiser updates" ON public.fundraiser_updates;
CREATE POLICY "Public can view fundraiser updates" ON public.fundraiser_updates FOR SELECT USING (true);

-- ORGANIZER_FOLLOWS: restore blanket reads (view is left in place; harmless).
DROP POLICY IF EXISTS "Users can read their own follows" ON public.organizer_follows;
DROP POLICY IF EXISTS "Organizers can read their own followers" ON public.organizer_follows;
CREATE POLICY "Anyone can view follows" ON public.organizer_follows FOR SELECT USING (true);
CREATE POLICY "Organizer follows are publicly readable" ON public.organizer_follows FOR SELECT USING (true);

-- FOLLOWS: restore blanket read.
DROP POLICY IF EXISTS "Users can read own follow edges" ON public.follows;
CREATE POLICY "Follows are publicly readable" ON public.follows FOR SELECT USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
