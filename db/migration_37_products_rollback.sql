-- migration_37_products_rollback.sql
-- Rollback for migration_37_products.sql — Case A only: safe to run ONLY
-- before any real data exists in products/product_orders (i.e. before the
-- Phase 3 checkout routes ship and start inserting real rows).
--
-- migration_37 is purely additive (CREATE TABLE/INDEX/POLICY/TRIGGER/
-- FUNCTION) with no ALTER of any existing table, so this rollback touches
-- nothing outside the two new tables and their two trigger functions.
--
-- product_orders is dropped first since it has a FOREIGN KEY into products
-- (ON DELETE RESTRICT — dropping products first would fail while
-- product_orders still exists and references it).
--
-- DROP TABLE cascades to the table's own indexes, RLS policies, and
-- triggers automatically — those don't need separate DROP statements here.
--
-- Do NOT run this once real product/order rows exist. At that point, use a
-- forward-only corrective migration instead — see the "Case B" discussion
-- in the commit/PR history for migration_37_products.sql.

DROP TABLE IF EXISTS product_orders;
DROP TABLE IF EXISTS products;
DROP FUNCTION IF EXISTS update_product_orders_updated_at();
DROP FUNCTION IF EXISTS update_products_updated_at();
