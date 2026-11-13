-- migration_199_atomic_table_settlement_and_order_ledger_rollback.sql
-- Rollback for Migration 199. Refuses to discard order ledger entries.

BEGIN;

DROP FUNCTION IF EXISTS public.record_storefront_order_paid_and_credit(uuid, text);
DROP FUNCTION IF EXISTS public.mark_table_paid_and_close_session(uuid, uuid, text, uuid);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.recipient_ledger_entries
     WHERE source_type = 'order'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_199_ROLLBACK_BLOCKED: order ledger entries exist; migrate or reconcile them before rollback';
  END IF;

  ALTER TABLE public.recipient_ledger_entries
    DROP CONSTRAINT IF EXISTS recipient_ledger_entries_source_type_check;
  ALTER TABLE public.recipient_ledger_entries
    ADD CONSTRAINT recipient_ledger_entries_source_type_check
    CHECK (source_type IN ('donation', 'ticket_order', 'product_order', 'payout', 'manual'))
    NOT VALID;
  ALTER TABLE public.recipient_ledger_entries
    VALIDATE CONSTRAINT recipient_ledger_entries_source_type_check;
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';