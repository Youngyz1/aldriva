-- migration_204_reservation_capacity_and_models_rollback.sql
-- Stage B rollback twin: fail-closed safety guard for reservation capacity and payment columns.

DO $$
DECLARE
  v_paid_count integer := 0;
BEGIN
  -- 1. Fail-closed: refuse to roll back if any deposits or payments have been recorded
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'payment_status'
  ) THEN
    SELECT count(*) INTO v_paid_count
    FROM public.reservations
    WHERE payment_status IN ('deposit_paid', 'paid')
       OR (deposit_amount IS NOT NULL AND deposit_amount > 0);

    IF v_paid_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_204_ROLLBACK_BLOCKED: % reservation(s) hold recorded payments or non-zero deposit amounts. Manual financial audit required.',
        v_paid_count;
    END IF;
  END IF;

  -- 2. Drop RPC function
  DROP FUNCTION IF EXISTS public.confirm_reservation_with_capacity(uuid, text, uuid, text);

  -- 3. Drop trigger and trigger function
  DROP TRIGGER IF EXISTS trg_sync_reservation_ends_at ON public.reservations;
  DROP FUNCTION IF EXISTS public.sync_reservation_ends_at();

  -- 4. Drop indexes
  DROP INDEX IF EXISTS public.idx_reservations_capacity_active_window;
  DROP INDEX IF EXISTS public.idx_reservations_organizer_capacity_window;
  DROP INDEX IF EXISTS public.idx_reservations_organizer_payment_status;

  -- 5. Drop reservations columns
  ALTER TABLE public.reservations
    DROP COLUMN IF EXISTS ends_at,
    DROP COLUMN IF EXISTS duration_minutes,
    DROP COLUMN IF EXISTS deposit_amount,
    DROP COLUMN IF EXISTS deposit_currency,
    DROP COLUMN IF EXISTS payment_status;

  -- 6. Drop businesses columns
  ALTER TABLE public.businesses
    DROP COLUMN IF EXISTS max_stay_minutes,
    DROP COLUMN IF EXISTS default_stay_minutes,
    DROP COLUMN IF EXISTS seat_capacity,
    DROP COLUMN IF EXISTS booking_model;
END $$;
