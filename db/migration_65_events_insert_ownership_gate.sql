-- migration_65_events_insert_ownership_gate.sql
-- Emergency fix, split out ahead of the full Phase 7 "events -> entity"
-- pass: events' INSERT policy ("Allow public insert") was WITH CHECK
-- (true) -- no auth check, no ownership check at all. Confirmed live
-- before writing this: UPDATE ("Users can update own events") and
-- DELETE ("Users can delete own events") already require
-- auth.uid() = user_id and are NOT part of this fix -- only INSERT was
-- actually open.
--
-- Scope, deliberately narrow per explicit instruction: only requires
-- auth.uid() = user_id on the new row. Does NOT check organizer_id
-- ownership (direct or via entity_members) -- that question is deferred
-- to the full Phase 7 pass. Known gap left open by design, not by
-- oversight: a legitimately-authenticated user (auth.uid() = user_id,
-- their own row) can still set organizer_id to an organizer they don't
-- own. Confirmed safe for real usage: app/create-event/page.tsx already
-- sets user_id: session.user.id on every insert, so this is a no-op for
-- the app's own flow and only closes the open-to-anyone path.
--
-- SELECT ("Allow public select", USING (true)) is untouched -- public
-- event browsing is almost certainly intentional and wasn't part of the
-- reported gap; not touching it without an explicit decision.

BEGIN;

DROP POLICY IF EXISTS "Allow public insert" ON events;
CREATE POLICY "Allow public insert" ON events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
