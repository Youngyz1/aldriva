-- 20260906000000_migration_101_p0_rls_enforcement.sql
--
-- Supabase-CLI mirror of db/migration_101_p0_rls_enforcement.sql (identical
-- body; the db/ file is canonical per CLAUDE.md). Kept in sync so `supabase
-- db push` deploys the same policy set as the manual db/ history.
--
-- P0 SECURITY REMEDIATION (F-03): overly-broad RLS on public marketplace tables.
--
-- Relationship to staged migrations 53 / 96 / 97: those files were staged in
-- db/ but (per commit 5c5f45b) had NOT been applied to the live project. This
-- migration is SELF-CONTAINED and IDEMPOTENT — every statement uses
-- DROP IF EXISTS / CREATE (or CREATE OR REPLACE), so it converges to the
-- secure end-state whether or not 53/96/97 were applied first. Applying 53/96/
-- 97 afterwards remains safe (identical policy names and predicates).
--
-- What changes (all PERMISSIVE-policy OR-semantics aware — the blanket
-- `USING (true)` / `WITH CHECK (true)` policies are DROPPED, not just
-- supplemented, because any remaining one would keep the hole open):
--
--   events:            INSERT restricted to row owner (auth.uid() = user_id) or
--                      active admin. SELECT restricted to approved + public +
--                      not-deleted rows, row owners, and active admins.
--   fundraisers:       INSERT restricted to authenticated owners creating
--                      pending_review rows (self-publish still blocked by the
--                      migration_41 status trigger), optionally linked to an
--                      organizer the caller owns. SELECT re-asserted as
--                      published-public / owner / admin (migration_41 text).
--   tickets:           INSERT restricted to event owners and active admins
--                      (migration_96 text). SELECT restricted to tickets of
--                      publicly-visible events, event owners, and active admins
--                      (prices must stay readable for checkout, but tickets of
--                      pending/private events must not leak). UPDATE/DELETE
--                      added for event owners and active admins (previously no
--                      policy at all — owner edits via events/edit failed
--                      closed; still fail closed for everyone else).
--   organizers:        blanket SELECT dropped; visibility+deleted_at scoped
--                      read retained (migration_53 §53.2 text) plus active-admin
--                      read. Sensitive registration columns revoked from
--                      anon/authenticated (migration_53 §53.3 text, plus the
--                      `fundraising_approved` column the create-fundraiser flow
--                      selects — omitting it would break that page).
--   fundraiser_media / fundraiser_updates: blanket SELECTs replaced with
--                      published-parent reads plus owner reads (53.4 text).
--   organizer_follows: blanket SELECTs replaced with own-follows +
--                      organizer-owner reads; public aggregate counts served by
--                      organizer_follower_counts view (53.5 text).
--   follows:           blanket SELECT replaced with own-edges read (97 text).
--
-- Verified compatible (all read/insert paths traced in app code):
--   * Public event/fundraiser/organizer pages read approved+public rows via
--     anon — still allowed. Owner previews use owner clauses or service role.
--   * create-event / create-fundraiser / create-organizer / import / sync
--     flows insert with user_id = caller (or via service role) — allowed.
--   * eventbrite-sync / gofundme-sync run as the caller's session and attach
--     rows to caller-owned organizers — allowed.
--   * Ticket checkout reads tickets of approved events via anon — allowed.
--   * Follower counts read organizer_follower_counts — allowed (view granted).
--   * tax_id / nonprofit_registration_number read only via service-role paths
--     (receipts, registration route, verify wizard server component).
--   * create-organizer's insert-return was narrowed to .select("id") in app
--     code alongside this migration (bare .select() would fail under the
--     column grants).
--
-- Rollback: db/migration_101_p0_rls_enforcement_rollback.sql (restores the
-- prior permissive policies; re-opens the holes — emergency use only).

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- EVENTS
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow public insert" ON public.events;
DROP POLICY IF EXISTS "Allow public select" ON public.events;

DROP POLICY IF EXISTS "Owners and admins can create events" ON public.events;
CREATE POLICY "Owners and admins can create events"
  ON public.events FOR INSERT
  WITH CHECK (
    (
      auth.uid() IS NOT NULL
      AND auth.uid() = user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Approved public events are readable" ON public.events;
CREATE POLICY "Approved public events are readable"
  ON public.events FOR SELECT
  USING (
    status = 'approved'
    AND visibility = 'public'
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "Owners can read their own events" ON public.events;
CREATE POLICY "Owners can read their own events"
  ON public.events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all events" ON public.events;
CREATE POLICY "Admins can read all events"
  ON public.events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- FUNDRAISERS (SELECT re-asserted from migration_41; INSERT impersonation closed)
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow public insert" ON public.fundraisers;
DROP POLICY IF EXISTS "Users can create fundraisers for their organizer profiles" ON public.fundraisers;
DROP POLICY IF EXISTS "Anyone can create a fundraiser pending review" ON public.fundraisers;

DROP POLICY IF EXISTS "Authenticated owners can create fundraisers pending review" ON public.fundraisers;
CREATE POLICY "Authenticated owners can create fundraisers pending review"
  ON public.fundraisers FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND status = 'pending_review'
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = fundraisers.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow public select" ON public.fundraisers;
DROP POLICY IF EXISTS "Fundraisers are publicly readable" ON public.fundraisers;

DROP POLICY IF EXISTS "Published fundraisers are public" ON public.fundraisers;
CREATE POLICY "Published fundraisers are public"
  ON public.fundraisers FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Owners can read their own fundraisers" ON public.fundraisers;
CREATE POLICY "Owners can read their own fundraisers"
  ON public.fundraisers FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = fundraisers.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can read all fundraisers" ON public.fundraisers;
CREATE POLICY "Admins can read all fundraisers"
  ON public.fundraisers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- TICKETS
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow public insert" ON public.tickets;

-- Ownership follows the events/edit access model: the event's creator
-- (events.user_id) or the owner of its organizer may manage tiers.
DROP POLICY IF EXISTS "Event owners and admins can create tickets" ON public.tickets;
CREATE POLICY "Event owners and admins can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND event_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id = tickets.event_id
          AND events.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.events
        JOIN public.organizers ON organizers.id = events.organizer_id
        WHERE events.id = tickets.event_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow public select" ON public.tickets;

DROP POLICY IF EXISTS "Tickets of visible events are readable" ON public.tickets;
CREATE POLICY "Tickets of visible events are readable"
  ON public.tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = tickets.event_id
        AND events.status = 'approved'
        AND events.visibility = 'public'
        AND events.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = tickets.event_id
        AND events.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Event owners and admins can update tickets" ON public.tickets;
CREATE POLICY "Event owners and admins can update tickets"
  ON public.tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = tickets.event_id
        AND events.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      JOIN public.organizers ON organizers.id = events.organizer_id
      WHERE events.id = tickets.event_id
        AND organizers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = tickets.event_id
        AND events.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      JOIN public.organizers ON organizers.id = events.organizer_id
      WHERE events.id = tickets.event_id
        AND organizers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Event owners and admins can delete tickets" ON public.tickets;
CREATE POLICY "Event owners and admins can delete tickets"
  ON public.tickets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = tickets.event_id
        AND events.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.events
      JOIN public.organizers ON organizers.id = events.organizer_id
      WHERE events.id = tickets.event_id
        AND organizers.user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- ORGANIZERS (53.2 text + admin read; 53.3 column grants + fundraising_approved)
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Public read organizers" ON public.organizers;

DROP POLICY IF EXISTS "Public organizers are readable" ON public.organizers;
CREATE POLICY "Public organizers are readable"
  ON public.organizers FOR SELECT
  USING (
    (visibility = 'public' AND deleted_at IS NULL)
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Admins can read all organizers" ON public.organizers;
CREATE POLICY "Admins can read all organizers"
  ON public.organizers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Column-level grants: RLS filters rows, never columns. tax_id and
-- nonprofit_registration_number are readable only via service-role paths.
-- fundraising_approved is included (unlike the 53 draft) because the
-- create-fundraiser flow selects it over the anon key.
REVOKE SELECT ON public.organizers FROM anon, authenticated;
GRANT SELECT (
  id, user_id, name, bio, photo, banner, slug, org_type, visibility, status,
  verified_at, website, facebook, twitter, instagram, linkedin, youtube,
  tiktok, contact_email, average_rating, review_count, follower_offset,
  events_offset, organization_name, fundraising_approved, created_at,
  updated_at, deleted_at
) ON public.organizers TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- FUNDRAISER MEDIA / UPDATES (53.4 text)
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Fundraiser media is publicly readable" ON public.fundraiser_media;
DROP POLICY IF EXISTS "Public can view fundraiser media" ON public.fundraiser_media;

DROP POLICY IF EXISTS "Media of published fundraisers is readable" ON public.fundraiser_media;
CREATE POLICY "Media of published fundraisers is readable"
  ON public.fundraiser_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fundraisers f
      WHERE f.id = fundraiser_media.fundraiser_id
        AND f.status = 'published'
        AND f.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Owners can read their own fundraiser media" ON public.fundraiser_media;
CREATE POLICY "Owners can read their own fundraiser media"
  ON public.fundraiser_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fundraisers f
      LEFT JOIN public.organizers o ON o.id = f.organizer_id
      WHERE f.id = fundraiser_media.fundraiser_id
        AND (f.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public can view fundraiser updates" ON public.fundraiser_updates;

DROP POLICY IF EXISTS "Updates of published fundraisers are readable" ON public.fundraiser_updates;
CREATE POLICY "Updates of published fundraisers are readable"
  ON public.fundraiser_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fundraisers f
      WHERE f.id = fundraiser_updates.fundraiser_id
        AND f.status = 'published'
        AND f.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Owners can read their own fundraiser updates" ON public.fundraiser_updates;
CREATE POLICY "Owners can read their own fundraiser updates"
  ON public.fundraiser_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fundraisers f
      LEFT JOIN public.organizers o ON o.id = f.organizer_id
      WHERE f.id = fundraiser_updates.fundraiser_id
        AND (f.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- ORGANIZER_FOLLOWS (53.5 text + aggregate view)
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can view follows" ON public.organizer_follows;
DROP POLICY IF EXISTS "Organizer follows are publicly readable" ON public.organizer_follows;

DROP POLICY IF EXISTS "Users can read their own follows" ON public.organizer_follows;
CREATE POLICY "Users can read their own follows"
  ON public.organizer_follows FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organizers can read their own followers" ON public.organizer_follows;
CREATE POLICY "Organizers can read their own followers"
  ON public.organizer_follows FOR SELECT
  USING (
    organizer_id IN (SELECT id FROM public.organizers WHERE user_id = auth.uid())
  );

CREATE OR REPLACE VIEW public.organizer_follower_counts AS
  SELECT organizer_id, count(*)::bigint AS follower_count
  FROM public.organizer_follows
  GROUP BY organizer_id;

GRANT SELECT ON public.organizer_follower_counts TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- FOLLOWS (user→user social graph; 97 text)
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Follows are publicly readable" ON public.follows;

DROP POLICY IF EXISTS "Users can read own follow edges" ON public.follows;
CREATE POLICY "Users can read own follow edges"
  ON public.follows FOR SELECT
  USING (
    auth.uid() = follower_id
    OR auth.uid() = following_id
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
