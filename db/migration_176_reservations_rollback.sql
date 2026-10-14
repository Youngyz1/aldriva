-- migration_176_reservations_rollback.sql
-- Rollback for Phase 7: request-based table reservations.
--
-- WARNING: this deletes all reservation data (DROP TABLE). There is no
-- archival: reservations are operational requests, not financial records.
--
-- 1. Drop the reservations RLS policies, indexes, and table.
-- 2. Restore the migration-172 notifications CHECK constraints
--    (removes reservation_placed / reservation).

DROP POLICY IF EXISTS "Tenant team members can view reservations" ON public.reservations;
DROP POLICY IF EXISTS "Tenant managers can update reservations" ON public.reservations;
DROP INDEX IF EXISTS public.idx_reservations_organizer_status_starts;
DROP INDEX IF EXISTS public.idx_reservations_organizer_starts;
DROP INDEX IF EXISTS public.idx_reservations_lookup_token;
DROP INDEX IF EXISTS public.reservations_organizer_idempotency_key;
DROP TABLE IF EXISTS public.reservations;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'donation', 'comment', 'like', 'fundraiser_approved',
    'fundraiser_rejected', 'follow', 'ticket_purchase',
    'product_purchase', 'product_update', 'product_refund',
    'order_placed'
  ));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_related_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_related_type_check
  CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile', 'product', 'order', 'organizer'));
