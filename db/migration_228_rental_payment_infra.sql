-- Migration 228: Rental payment infrastructure (schema only)
-- Safe on a clean DB and on a DB that already has an earlier 228. Safe to run twice.

BEGIN;

-- Temporary helper (disappears at the end of the session)
CREATE OR REPLACE FUNCTION pg_temp.add_check(p_table regclass, p_name text, p_expr text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = p_table AND conname = p_name
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s)', p_table, p_name, p_expr);
  END IF;
END;
$f$;

-- ── 0. Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('businesses'), ('rental_bookings'), ('vehicles'),
      ('organizers'), ('recipient_ledger_entries')
    ) AS t(tbl)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      v_missing := v_missing || ('table ' || r.tbl);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
      ('businesses',      'rental_confirmation_mode'),
      ('rental_bookings', 'vehicle_id'),
      ('rental_bookings', 'booking_period'),
      ('rental_bookings', 'status'),
      ('rental_bookings', 'payment_status'),
      ('rental_bookings', 'rental_amount'),
      ('rental_bookings', 'snapshot_currency'),
      ('rental_bookings', 'source'),
      ('rental_bookings', 'business_id'),
      ('rental_bookings', 'organizer_id')
    ) AS t(tbl, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col
    ) THEN
      v_missing := v_missing || ('column ' || r.tbl || '.' || r.col);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
      ('rental_bookings',          'rental_bookings_status_check'),
      ('rental_bookings',          'rental_bookings_payment_status_check'),
      ('rental_bookings',          'uq_rental_bookings_no_overlap'),
      ('recipient_ledger_entries', 'recipient_ledger_entries_source_type_check')
    ) AS t(tbl, con)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.con AND conrelid = to_regclass('public.' || r.tbl)
    ) THEN
      v_missing := v_missing || ('constraint ' || r.con);
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: missing: %. Apply migrations 224-227 first.',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── 1. businesses columns ───────────────────────────────────────────────────
DO $$
DECLARE
  v_first_run boolean;
BEGIN
  v_first_run := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'businesses'
       AND column_name = 'rental_payment_policy'
  );

  ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS rental_payment_policy text NOT NULL DEFAULT 'offline',
    ADD COLUMN IF NOT EXISTS rental_advance_pct integer NULL,
    ADD COLUMN IF NOT EXISTS rental_payment_link_hours integer NOT NULL DEFAULT 48;

  -- Remove auto-named duplicates from an earlier version
  ALTER TABLE public.businesses
    DROP CONSTRAINT IF EXISTS businesses_rental_payment_policy_check,
    DROP CONSTRAINT IF EXISTS businesses_rental_advance_pct_check,
    DROP CONSTRAINT IF EXISTS businesses_rental_payment_link_hours_check;

  PERFORM pg_temp.add_check('public.businesses', 'chk_businesses_rental_payment_policy',
    $c$rental_payment_policy IN ('offline', 'full_online', 'advance_online')$c$);
  PERFORM pg_temp.add_check('public.businesses', 'chk_businesses_rental_advance_pct_range',
    $c$rental_advance_pct IS NULL OR (rental_advance_pct BETWEEN 10 AND 90)$c$);
  PERFORM pg_temp.add_check('public.businesses', 'chk_businesses_rental_payment_link_hours',
    $c$rental_payment_link_hours BETWEEN 1 AND 168$c$);
  PERFORM pg_temp.add_check('public.businesses', 'chk_businesses_advance_requires_pct',
    $c$rental_payment_policy <> 'advance_online' OR rental_advance_pct IS NOT NULL$c$);

  -- One-time only: a re-run never overwrites an owner's later choice
  IF v_first_run THEN
    UPDATE public.businesses
       SET rental_payment_policy = 'full_online'
     WHERE rental_confirmation_mode = 'instant';
  END IF;
END;
$$;

COMMENT ON COLUMN public.businesses.rental_payment_policy IS
  'offline=pay at pickup; full_online=100% via Stripe; advance_online=advance pct online, balance at pickup.';
COMMENT ON COLUMN public.businesses.rental_advance_pct IS
  'Percentage charged online when policy=advance_online (10 to 90).';
COMMENT ON COLUMN public.businesses.rental_payment_link_hours IS
  'Payment window in hours after owner confirmation (1 to 168, default 48).';

-- ── 2. rental_bookings columns ──────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.rental_bookings
    ADD COLUMN IF NOT EXISTS payment_due_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS customer_locale text NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS snapshot_confirmation_mode text NULL,
    ADD COLUMN IF NOT EXISTS snapshot_payment_policy text NULL,
    ADD COLUMN IF NOT EXISTS snapshot_advance_pct integer NULL,
    ADD COLUMN IF NOT EXISTS amount_due_online numeric(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS expired_at timestamptz NULL;

  -- Fill only rows where the snapshot is still NULL (new column, or old nullable version)
  UPDATE public.rental_bookings rb
     SET snapshot_confirmation_mode =
           CASE WHEN b.rental_confirmation_mode = 'approval' THEN 'approval' ELSE 'instant' END
    FROM public.businesses b
   WHERE rb.business_id = b.id
     AND rb.snapshot_confirmation_mode IS NULL;

  UPDATE public.rental_bookings
     SET snapshot_confirmation_mode = 'instant'
   WHERE snapshot_confirmation_mode IS NULL;

  -- Pending online bookings take the business's current policy and online amount
  UPDATE public.rental_bookings rb
     SET snapshot_payment_policy = b.rental_payment_policy,
         snapshot_advance_pct = CASE WHEN b.rental_payment_policy = 'advance_online'
                                     THEN b.rental_advance_pct ELSE NULL END,
         amount_due_online = CASE
           WHEN b.rental_payment_policy = 'full_online' THEN rb.rental_amount
           WHEN b.rental_payment_policy = 'advance_online' AND b.rental_advance_pct IS NOT NULL
             THEN ROUND(rb.rental_amount * b.rental_advance_pct / 100.0, 2)
           ELSE 0.00
         END
    FROM public.businesses b
   WHERE rb.business_id = b.id
     AND rb.snapshot_payment_policy IS NULL
     AND rb.status = 'pending'
     AND rb.source = 'online';

  UPDATE public.rental_bookings
     SET snapshot_payment_policy = 'offline'
   WHERE snapshot_payment_policy IS NULL;

  -- Defaults + NOT NULL so the CURRENT create_rental_booking keeps working before 229
  ALTER TABLE public.rental_bookings
    ALTER COLUMN snapshot_confirmation_mode SET DEFAULT 'instant',
    ALTER COLUMN snapshot_confirmation_mode SET NOT NULL,
    ALTER COLUMN snapshot_payment_policy SET DEFAULT 'offline',
    ALTER COLUMN snapshot_payment_policy SET NOT NULL;

  -- Remove auto-named duplicates from an earlier version
  ALTER TABLE public.rental_bookings
    DROP CONSTRAINT IF EXISTS rental_bookings_customer_locale_check,
    DROP CONSTRAINT IF EXISTS rental_bookings_snapshot_advance_pct_check,
    DROP CONSTRAINT IF EXISTS rental_bookings_amount_due_online_check;

  PERFORM pg_temp.add_check('public.rental_bookings', 'chk_rental_bookings_customer_locale',
    $c$customer_locale IN ('en', 'fr')$c$);
  PERFORM pg_temp.add_check('public.rental_bookings', 'chk_rental_bookings_snapshot_advance_pct',
    $c$snapshot_advance_pct IS NULL OR (snapshot_advance_pct BETWEEN 10 AND 90)$c$);
  PERFORM pg_temp.add_check('public.rental_bookings', 'chk_rental_bookings_amount_due_online',
    $c$amount_due_online >= 0$c$);
  PERFORM pg_temp.add_check('public.rental_bookings', 'chk_rental_bookings_snapshot_conf_mode',
    $c$snapshot_confirmation_mode IN ('instant', 'approval')$c$);
  PERFORM pg_temp.add_check('public.rental_bookings', 'chk_rental_bookings_snapshot_payment_policy',
    $c$snapshot_payment_policy IN ('offline', 'full_online', 'advance_online')$c$);
  PERFORM pg_temp.add_check('public.rental_bookings', 'chk_rental_bookings_advance_requires_pct',
    $c$snapshot_payment_policy <> 'advance_online' OR snapshot_advance_pct IS NOT NULL$c$);
END;
$$;

-- ── 3. status / payment_status / overlap (rebuilt only if values are missing) ──
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conname = 'rental_bookings_status_check'
     AND conrelid = 'public.rental_bookings'::regclass;
  IF v_def IS NULL OR v_def NOT LIKE '%awaiting_payment%' THEN
    ALTER TABLE public.rental_bookings DROP CONSTRAINT IF EXISTS rental_bookings_status_check;
    ALTER TABLE public.rental_bookings ADD CONSTRAINT rental_bookings_status_check
      CHECK (status IN ('pending','awaiting_payment','confirmed','active',
                        'completed','cancelled','expired','no_show'));
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conname = 'rental_bookings_payment_status_check'
     AND conrelid = 'public.rental_bookings'::regclass;
  IF v_def IS NULL OR v_def NOT LIKE '%partially_paid%' THEN
    ALTER TABLE public.rental_bookings DROP CONSTRAINT IF EXISTS rental_bookings_payment_status_check;
    ALTER TABLE public.rental_bookings ADD CONSTRAINT rental_bookings_payment_status_check
      CHECK (payment_status IN ('unpaid','partially_paid','paid','refunded'));
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conname = 'uq_rental_bookings_no_overlap'
     AND conrelid = 'public.rental_bookings'::regclass;
  IF v_def IS NULL OR v_def NOT LIKE '%awaiting_payment%' THEN
    ALTER TABLE public.rental_bookings DROP CONSTRAINT IF EXISTS uq_rental_bookings_no_overlap;
    ALTER TABLE public.rental_bookings ADD CONSTRAINT uq_rental_bookings_no_overlap
      EXCLUDE USING gist (vehicle_id WITH =, booking_period WITH &&)
      WHERE (vehicle_id IS NOT NULL
             AND status IN ('pending','awaiting_payment','confirmed','active'));
  END IF;
END;
$$;

-- ── 4. Ledger source_type: add 'rental_booking' (static list) ───────────────
DO $$
DECLARE
  v_def text;
  v_old text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conname = 'recipient_ledger_entries_source_type_check'
     AND conrelid = 'public.recipient_ledger_entries'::regclass;

  IF v_def NOT LIKE '%rental_booking%' THEN
    -- Safety: refuse to replace a list that has values we do not know about
    FOREACH v_old IN ARRAY ARRAY['donation','manual','order','payout',
                                 'product_order','reservation_payment','ticket_order']
    LOOP
      IF v_def NOT LIKE '%''' || v_old || '''%' THEN
        RAISE EXCEPTION 'LEDGER_CONSTRAINT_UNEXPECTED: live definition lacks %, got: %', v_old, v_def;
      END IF;
    END LOOP;

    ALTER TABLE public.recipient_ledger_entries
      DROP CONSTRAINT recipient_ledger_entries_source_type_check;
    ALTER TABLE public.recipient_ledger_entries
      ADD CONSTRAINT recipient_ledger_entries_source_type_check
      CHECK (source_type = ANY (ARRAY['donation','manual','order','payout','product_order',
                                      'rental_booking','reservation_payment','ticket_order']));
  END IF;
END;
$$;

-- ── 5. rental_payments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_payments (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id               uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  organizer_id             uuid NOT NULL REFERENCES public.organizers(id) ON DELETE RESTRICT,
  kind                     text NOT NULL CHECK (kind IN ('rental_charge','advance','balance','refund','late_fee','other')),
  method                   text NOT NULL CHECK (method IN ('stripe','cash','mobile_money','card_offline','other')),
  amount                   numeric(12,2) NOT NULL CHECK (amount > 0),
  currency                 text NOT NULL CHECK (currency = lower(currency) AND currency ~ '^[a-z]{3}$'),
  direction                text NOT NULL DEFAULT 'credit' CHECK (direction IN ('credit','debit')),
  applied                  boolean NOT NULL DEFAULT true,
  stripe_session_id        text UNIQUE,
  stripe_payment_intent_id text,
  stripe_refund_id         text,
  recorded_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rental_payments_refund_debit CHECK (kind <> 'refund' OR direction = 'debit')
);

CREATE INDEX IF NOT EXISTS idx_rental_payments_booking_id
  ON public.rental_payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_organizer_id
  ON public.rental_payments (organizer_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_stripe_pi
  ON public.rental_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_payments_stripe_refund_id
  ON public.rental_payments (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_payments TO service_role;

-- ── 6. rental_checkout_sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_checkout_sessions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id        uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  kind              text NOT NULL CHECK (kind IN ('full','advance')),
  amount            numeric(12,2) NOT NULL CHECK (amount > 0),
  expires_at        timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- At most one open checkout session per booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_checkout_sessions_booking_open
  ON public.rental_checkout_sessions (booking_id)
  WHERE status = 'open';

ALTER TABLE public.rental_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_checkout_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_checkout_sessions TO service_role;

-- ── 7. rental_booking_events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_booking_events (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id   uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN (
                 'status_change','payment_link_sent','deadline_extended',
                 'payment_override','email_sent','email_failed')),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_events_booking_id
  ON public.rental_booking_events (booking_id);

ALTER TABLE public.rental_booking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_booking_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_booking_events TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';