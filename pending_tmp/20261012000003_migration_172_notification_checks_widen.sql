-- migration_172_notification_checks_widen.sql
-- Phase 2b-2.2: Widen notifications CHECK constraints to the union of every
-- value ever allowed plus every value the application sends.
--
-- History (verified in db/):
-- - migration_44: type (donation, comment, like, fundraiser_approved,
--   fundraiser_rejected, follow, ticket_purchase); related_type (fundraiser,
--   comment, event, profile).
-- - migration_116: type += product_purchase, product_update, product_refund;
--   related_type += product.
-- - migration_171: type += order_placed; related_type += order.
-- - Code additionally sends related_type 'organizer' (organizer-follow path
--   in app/api/follow/route.ts); no migration between 116 and 171 ever
--   allowed 'organizer'.
--
-- This migration drops nothing: type keeps all 11 values allowed by 171;
-- related_type keeps all 6 values allowed by 171 and adds 'organizer'.
-- Additive CHECK change only; no RLS or data change. NOT yet applied.

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
