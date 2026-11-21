-- Migration 196: owner-picked "You might also like" suggestions.
-- PROPOSED — NOT APPLIED. Written for review only (Showcase Task 3,
-- Discovery 0d-iii: no related/recommended/pairs-with field exists today
-- on menu_items, products, or services; the Showcase item sheet currently
-- falls back to automatic suggestions — same category first, then
-- Popular — because there is nowhere for an owner to pick items by hand).
--
-- Adds a nullable, owner-ordered list of up to 4 related menu item IDs.
-- Additive only: existing rows get NULL (automatic suggestions keep
-- working everywhere until an owner explicitly picks items), no existing
-- column is touched, and the FK uses ON DELETE SET NULL semantics applied
-- per-array-element at the application layer (see note below) rather than
-- a DB-enforced FK, since Postgres cannot FK into an array column.
-- Idempotent.
BEGIN;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS related_item_ids uuid[];

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_related_item_ids_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_related_item_ids_check
  CHECK (related_item_ids IS NULL OR array_length(related_item_ids, 1) <= 4);

COMMENT ON COLUMN public.menu_items.related_item_ids IS
  'Owner-picked "You might also like" items for this item''s detail sheet, up to 4, same organizer, in display order. NULL/empty falls back to automatic suggestions (same category first, then Popular). Referenced item IDs are not DB-enforced (no FK into an array column) — application code must drop IDs that no longer resolve to an active item owned by the same organizer, the same way it already drops stale ids from content.featured.menu_item_ids.';

COMMIT;
