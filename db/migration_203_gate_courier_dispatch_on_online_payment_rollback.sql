-- Migration 203 rollback is intentionally blocked.
-- Removing the payment predicate or payment_status trigger could expose
-- unpaid online orders to couriers or strand orders paid after acceptance.
-- Removing the claim guard could also let an older open offer bypass the feed.

DO $migration_203_rollback_guard$
BEGIN
  RAISE EXCEPTION 'MIGRATION_203_ROLLBACK_BLOCKED: restoring courier dispatch for unpaid online orders, removing the claim guard, or removing payment_status dispatch would violate the online payment gate; prepare a separately reviewed replacement first.';
END;
$migration_203_rollback_guard$;
