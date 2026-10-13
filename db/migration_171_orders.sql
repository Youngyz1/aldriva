-- migration_171_orders.sql
-- Phase 2b-2: Cart, checkout, order request, owner visibility
--
-- 1. Extend notifications CHECK constraints to support order_placed / order.
-- 2. Add public.orders table with full fulfillment, pricing snapshot, and idempotency guarantees.
-- 3. Row-level security for public.orders: strictly tenant-scoped (no anon access).
--    SELECT: owner, admin, manager, editor, finance.
--    UPDATE: owner, admin, manager.

-- ── 1. notifications: order event types ─────────────────────────────────────

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
  CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile', 'product', 'order'));

-- ── 2. orders table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  website_id uuid NULL REFERENCES public.tenant_websites(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  tracking_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text NULL,
  fulfilment_type text NOT NULL CHECK (fulfilment_type IN ('pickup', 'delivery')),
  delivery_address text NULL,
  customer_note text NULL,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
  payment_method text NOT NULL DEFAULT 'on_fulfilment' CHECK (payment_method IN ('on_fulfilment', 'online', 'mobile_money')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  provider text NULL,
  provider_reference text NULL,
  scheduled_for timestamptz NULL,
  items jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_organizer_order_number_key UNIQUE (organizer_id, order_number),
  CONSTRAINT orders_organizer_idempotency_key UNIQUE (organizer_id, idempotency_key),
  CONSTRAINT orders_delivery_address_required CHECK (
    (fulfilment_type = 'delivery' AND delivery_address IS NOT NULL AND length(trim(delivery_address)) > 0)
    OR (fulfilment_type = 'pickup')
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_organizer_id ON public.orders(organizer_id);
CREATE INDEX IF NOT EXISTS idx_orders_website_id ON public.orders(website_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders(tracking_token);

-- ── 3. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orders FROM anon;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT SELECT, UPDATE ON TABLE public.orders TO authenticated;

-- SELECT: owner, admin, manager, editor, finance
DROP POLICY IF EXISTS "Tenant team members can view orders" ON public.orders;
CREATE POLICY "Tenant team members can view orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    public.is_entity_member(orders.organizer_id, ARRAY['owner','admin','manager','editor','finance'])
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = orders.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- UPDATE: owner, admin, manager
DROP POLICY IF EXISTS "Tenant managers can update orders" ON public.orders;
CREATE POLICY "Tenant managers can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    public.is_entity_member(orders.organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = orders.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    public.is_entity_member(orders.organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = orders.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );
