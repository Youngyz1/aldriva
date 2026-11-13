-- Migration 202 rollback is intentionally blocked.
-- Removing READY from post-completion dispatch would leave unclaimed READY
-- delivery orders waiting after a courier finishes an earlier delivery.
-- Prepare a separately reviewed replacement before changing this function.

DO $migration_202_rollback_guard$
BEGIN
  RAISE EXCEPTION 'MIGRATION_202_ROLLBACK_BLOCKED: removing READY from courier-completion dispatch would leave unclaimed READY deliveries waiting; prepare a separately reviewed replacement first.';
END;
$migration_202_rollback_guard$;
