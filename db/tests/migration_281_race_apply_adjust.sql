-- migration_281_race_apply_adjust.sql
-- DRAFT ONLY. Two-session race script for migration 281 (adjust vs adjust).
--
-- FILL IN IDS BEFORE RUNNING (replace all placeholders):
--   <BUSINESS_UUID>  - business that owns item/location
--   <ITEM_UUID>      - inventory_items.id
--   <LOCATION_UUID>  - inventory_locations.id (active, same business)
--
-- HOW TO RUN (two SQL Editor tabs/sessions, as postgres or service_role):
--   1) SETUP (once): create known stock.
--        BEGIN;
--        SELECT public.inventory_apply_movement('<BUSINESS_UUID>'::uuid,'<ITEM_UUID>'::uuid,'<LOCATION_UUID>'::uuid,'received',5,'race setup',NULL,'manual',NULL);
--        COMMIT;
--   2) TAB A: run the SESSION A block up to and including pg_sleep(10); do not commit yet.
--   3) TAB B: while TAB A sleeps, run the SESSION B block.
--   4) TAB A: COMMIT.
--
-- EXPECTED:
--   - No deadlock.
--   - TAB B blocks on inventory_balances row FOR UPDATE until TAB A commits.
--   - Final outcome: one decrement succeeds, other fails with inventory_insufficient_stock
--     (5-4-4 < 0), or stock remains >= 0. No negative stock.

-- ===================== SESSION A (TAB A) =====================
BEGIN;
SELECT public.inventory_apply_movement(
  '<BUSINESS_UUID>'::uuid, '<ITEM_UUID>'::uuid, '<LOCATION_UUID>'::uuid,
  'sold', -4, 'race A', NULL, 'manual', NULL
);
-- PAUSE HERE (keep transaction open). In psql: \prompt. In SQL editor: wait.
SELECT pg_sleep(10);
COMMIT;

-- ===================== SESSION B (TAB B) =====================
-- Run concurrently while SESSION A is paused before COMMIT.
BEGIN;
SELECT public.inventory_apply_movement(
  '<BUSINESS_UUID>'::uuid, '<ITEM_UUID>'::uuid, '<LOCATION_UUID>'::uuid,
  'sold', -4, 'race B', NULL, 'manual', NULL
);
COMMIT;
-- EXPECTED: blocks until A commits, then errors with 'Not enough stock'
-- (HINT inventory_insufficient_stock) because 5-4-4 < 0.
