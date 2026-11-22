-- Migration 201 rollback is intentionally blocked.
-- Restoring the migration-200 ETA gate/fanout cap or making expires_at required
-- would reintroduce missing-ASAP dispatch gaps and allow ASAP offers to expire
-- before READY. This migration has no data backfill. Prepare a separately
-- reviewed replacement before changing these functions, trigger, or nullability.

DO $migration_201_rollback_guard$
BEGIN
  RAISE EXCEPTION 'MIGRATION_201_ROLLBACK_BLOCKED: restoring the prior courier dispatch behavior would reintroduce missing-ETA dispatch gaps and expire ASAP offers before READY; prepare a separately reviewed replacement first.';
END;
$migration_201_rollback_guard$;
