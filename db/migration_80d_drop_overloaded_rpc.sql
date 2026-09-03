-- migration_80d_drop_overloaded_rpc.sql
-- Drops old 12-parameter record_ticket_and_credit RPC overload to prevent Postgres RPC resolution ambiguity.

BEGIN;

DROP FUNCTION IF EXISTS record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT
);

COMMIT;

NOTIFY pgrst, 'reload schema';
