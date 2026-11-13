-- Migration 200 rollback is intentionally blocked.
-- Restoring migration 192's prior function body reintroduces an INSERT arity
-- error which aborts order acceptance whenever a courier is eligible.

DO $migration_200_rollback_guard$
BEGIN
  RAISE EXCEPTION 'MIGRATION_200_ROLLBACK_BLOCKED: restoring the previous dispatch function reintroduces an INSERT error and breaks order acceptance; prepare a separately reviewed replacement first.';
END;
$migration_200_rollback_guard$;
