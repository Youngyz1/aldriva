-- Rollback for Migration 265: Event Guestbook Entries
DROP TABLE IF EXISTS event_guestbook_entries CASCADE;
