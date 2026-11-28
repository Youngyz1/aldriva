-- migration_174_order_timing.sql
-- Phase 4b+4c: Order operations, status actions, order timing, and customer tracking.
-- Files only; NOT yet applied.
--
-- ── A. orders timing and history columns (additive only) ───────────────────
--
-- estimated_ready_at: Owner-promised readiness timestamp. Set at order acceptance
--   or updated during preparation. NULL while pending or when not set.
--
-- status_history: Append-only JSONB log recording status transition events:
--   [{ status, at, by_user_id, reason, note, estimated_ready_at }].
--
-- cancellation_reason: Reason code when cancelled (out_of_stock, kitchen_closed,
--   cannot_deliver_there, other).
--
-- scheduled_for: Reused from migration 171 as the customer's chosen fulfillment
--   time (NULL = As soon as possible / ASAP).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(status_history) = 'array'),
  ADD COLUMN IF NOT EXISTS cancellation_reason text NULL;

COMMENT ON COLUMN public.orders.estimated_ready_at IS
  'Owner-promised readiness timestamp. NULL until owner accepts the order.';
COMMENT ON COLUMN public.orders.status_history IS
  'Append-only log of status transitions and time adjustments: array of {status, at, by_user_id, reason, note, estimated_ready_at}.';
COMMENT ON COLUMN public.orders.cancellation_reason IS
  'Reason for cancellation (out_of_stock, kitchen_closed, cannot_deliver_there, other).';

-- ── B. Composite index for dashboard order queries ─────────────────────────
--
-- Supports the owner dashboard filtering by status and sorting by created_at DESC
-- within an organizer workspace, plus overview dashboard attention counts.

CREATE INDEX IF NOT EXISTS idx_orders_org_status_created
  ON public.orders(organizer_id, status, created_at DESC);
