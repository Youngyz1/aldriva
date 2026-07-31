-- ============================================================================
-- 011_realtime.sql — Realtime publication membership, matching production.
--
-- Production has exactly ONE application table in the `supabase_realtime`
-- publication: public.notifications. No other table (events, tickets, seats,
-- donations, etc.) broadcasts postgres_changes to Realtime subscribers.
-- (A second publication, supabase_realtime_messages_publication, is Realtime's
-- own internal broadcast/presence support and is managed by Supabase — do not
-- touch it.)
-- ============================================================================

alter publication supabase_realtime add table public.notifications;

-- If any "live" UI feature in the app (live seat maps, live donation ticker,
-- live comment counts) turns out to actually depend on postgres_changes for a
-- table NOT listed here, add it explicitly, e.g.:
--   alter publication supabase_realtime add table public.seats;
-- Verify against app code (grep for `.channel(` / `postgres_changes` under
-- app/ and hooks/) rather than assuming — the audit found no evidence any
-- other table needs this.
