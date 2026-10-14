-- 20261014050000_migration_176_reservations.sql
-- Mirror of db/migration_176_reservations.sql
-- Request-based table reservations: table, notifications CHECKs, RLS.

-- migration_176_reservations.sql
-- Phase 7: Request-based table reservations.
--
-- 1. Extend notifications CHECK constraints with reservation_placed / reservation
--    (current base is migration_172_notification_checks_widen.sql; additive only).
-- 2. Add public.reservations table: request-based table bookings (booking_type
--    'table' only in this phase; rental/appointment are column values only).
--    The customer asks; the owner confirms or declines. No capacity model.
-- 3. Row-level security mirrors public.orders (migration_171): strictly
--    tenant-scoped, no anon/public access. SELECT: owner, admin, manager,
--    editor, finance. UPDATE: owner, admin, manager.
--
-- No updated_at trigger (public.orders uses none either): the server action
-- sets updated_at on every write.
--
-- Files only; NOT yet applied.

-- ── 1. notifications: reservation event types ───────────────────────────────

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'donation', 'comment', 'like', 'fundraiser_approved',
    'fundraiser_rejected', 'follow', 'ticket_purchase',
    'product_purchase', 'product_update', 'product_refund',
    'order_placed', 'reservation_placed'
  ));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_related_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_related_type_check
  CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile', 'product', 'order', 'organizer', 'reservation'));

-- ── 2. reservations table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  website_id uuid NULL REFERENCES public.tenant_websites(id) ON DELETE SET NULL,
  booking_type text NOT NULL DEFAULT 'table' CHECK (booking_type IN ('table', 'rental', 'appointment')),
  reservation_number text NOT NULL,
  -- 48-hex lookup token, generated in the server action with
  -- crypto.randomBytes (same entropy shape as orders.tracking_token).
  lookup_token text NOT NULL,
  customer_name text NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 100),
  customer_phone text NOT NULL,
  customer_email text NULL,
  party_size int NOT NULL CHECK (party_size BETWEEN 1 AND 50),
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'seated', 'completed', 'no_show', 'cancelled')),
  customer_note text NULL CHECK (customer_note IS NULL OR length(customer_note) <= 300),
  owner_note text NULL CHECK (owner_note IS NULL OR length(owner_note) <= 300),
  decline_reason text NULL,
  idempotency_key text NULL,
  status_history jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(status_history) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservations_organizer_number_key UNIQUE (organizer_id, reservation_number)
);

-- Idempotency: one live row per client key (NULL keys never collide).
CREATE UNIQUE INDEX IF NOT EXISTS reservations_organizer_idempotency_key
  ON public.reservations(organizer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_lookup_token ON public.reservations(lookup_token);
CREATE INDEX IF NOT EXISTS idx_reservations_organizer_starts ON public.reservations(organizer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_organizer_status_starts ON public.reservations(organizer_id, status, starts_at DESC);

-- ── 3. Row Level Security (mirrors public.orders) ───────────────────────────

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reservations FROM anon;
GRANT ALL ON TABLE public.reservations TO service_role;
GRANT SELECT, UPDATE ON TABLE public.reservations TO authenticated;

-- SELECT: owner, admin, manager, editor, finance
DROP POLICY IF EXISTS "Tenant team members can view reservations" ON public.reservations;
CREATE POLICY "Tenant team members can view reservations"
  ON public.reservations FOR SELECT
  TO authenticated
  USING (
    public.is_entity_member(reservations.organizer_id, ARRAY['owner','admin','manager','editor','finance'])
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = reservations.organizer_id
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
DROP POLICY IF EXISTS "Tenant managers can update reservations" ON public.reservations;
CREATE POLICY "Tenant managers can update reservations"
  ON public.reservations FOR UPDATE
  TO authenticated
  USING (
    public.is_entity_member(reservations.organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = reservations.organizer_id
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
    public.is_entity_member(reservations.organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = reservations.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );
