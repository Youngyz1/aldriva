-- migration_171_orders_rollback.sql
-- Rollback for migration 171

DROP POLICY IF EXISTS "Tenant managers can update orders" ON public.orders;
DROP POLICY IF EXISTS "Tenant team members can view orders" ON public.orders;
DROP TABLE IF EXISTS public.orders;

-- Restore notifications constraints to migration 116 state
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_related_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_related_type_check
  CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile', 'product'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'donation', 'comment', 'like', 'fundraiser_approved',
    'fundraiser_rejected', 'follow', 'ticket_purchase',
    'product_purchase', 'product_update', 'product_refund'
  ));
