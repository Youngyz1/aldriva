-- migration_72_ledger_credit_rpcs_rollback.sql
-- Drops the three RPCs created by migration_72_ledger_credit_rpcs.sql, and
-- nothing else. Safe at any point before the webhook (Phase B.2's second
-- half) is refactored to call them -- until then nothing references these
-- functions, so dropping them leaves donations/ticket_orders/product_orders/
-- recipients/recipient_ledger_entries/resolve_recipient() completely
-- unaffected.

BEGIN;

DROP FUNCTION IF EXISTS record_donation_and_credit(
  UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT
);

DROP FUNCTION IF EXISTS record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT
);

DROP FUNCTION IF EXISTS record_product_paid_and_credit(
  UUID, TEXT, TEXT
);

COMMIT;

NOTIFY pgrst, 'reload schema';
