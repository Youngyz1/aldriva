-- migration_174_order_timing_rollback.sql
-- Rollback for migration 174 (files only; 174 NOT yet applied).
--
-- Drops composite index and added timing columns on public.orders.

DROP INDEX IF EXISTS idx_orders_org_status_created;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS cancellation_reason,
  DROP COLUMN IF EXISTS status_history,
  DROP COLUMN IF EXISTS estimated_ready_at;
