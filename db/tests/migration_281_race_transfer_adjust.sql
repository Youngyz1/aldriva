-- migration_281_race_transfer_adjust.sql
-- DRAFT ONLY. Two-session race script for migration 281 (transfer vs adjust).
--
-- FILL IN IDS BEFORE RUNNING (replace all placeholders):
--   <BUSINESS_UUID>        - business that owns item/locations
--   <ITEM_UUID>            - inventory_items.id
--   <SOURCE_LOCATION_UUID> - active source inventory_locations.id
--   <DEST_LOCATION_UUID>   - active destination inventory_locations.id
--
-- HOW TO RUN (two SQL Editor tabs/sessions, as postgres or service_role):
--   1) SETUP (once): ensure source has known stock (e.g. 5).
--        BEGIN;
--        SELECT public.inventory_apply_movement('<BUSINESS_UUID>'::uuid,'<ITEM_UUID>'::uuid,'<SOURCE_LOCATION_UUID>'::uuid,'received',5,'race setup',NULL,'manual',NULL);
--        COMMIT;
--   2) TAB A: run SESSION A block up to and including pg_sleep(10); do not commit yet.
--   3) TAB B: while TAB A sleeps, run SESSION B block.
--   4) TAB A: COMMIT.
--
-- EXPECTED:
--   - No deadlock (lock order: location FOR SHARE, then balance FOR UPDATE in id order).
--   - Serialized on same source balance row; no negative stock.
--   - One succeeds and other fails with inventory_insufficient_stock if remaining < 4.

-- ===================== SESSION A (TAB A) =====================
BEGIN;
SELECT public.inventory_transfer_stock(
  '<BUSINESS_UUID>'::uuid, '<ITEM_UUID>'::uuid,
  '<SOURCE_LOCATION_UUID>'::uuid, '<DEST_LOCATION_UUID>'::uuid,
  4, 'race transfer A'
);
-- PAUSE HERE (keep transaction open).
SELECT pg_sleep(10);
COMMIT;

-- ===================== SESSION B (TAB B) =====================
-- Run concurrently while SESSION A is paused before COMMIT.
BEGIN;
SELECT public.inventory_apply_movement(
  '<BUSINESS_UUID>'::uuid, '<ITEM_UUID>'::uuid, '<SOURCE_LOCATION_UUID>'::uuid,
  'sold', -4, 'race adjust B', NULL, 'manual', NULL
);
COMMIT;
-- EXPECTED: B blocks on source balance row lock; after A commits, B errors with
-- inventory_insufficient_stock if remaining < 4. No deadlock.
