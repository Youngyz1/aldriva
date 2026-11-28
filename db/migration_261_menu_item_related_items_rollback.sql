-- Rollback for migration 261. Removes the owner-picked related-items column.
BEGIN;

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_related_item_ids_check;
ALTER TABLE public.menu_items DROP COLUMN IF EXISTS related_item_ids;

COMMIT;
