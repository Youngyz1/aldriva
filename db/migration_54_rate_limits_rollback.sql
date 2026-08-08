-- migration_54_rate_limits_rollback.sql
--
-- WARNING: removes application-level rate limiting (HIGH-3). The payment,
-- email and outbound-fetch endpoints become unmetered again.
--
-- lib/rate-limit.ts fails OPEN, so the application keeps working after this
-- runs — the limiter simply stops limiting. That is deliberate (a limiter
-- outage must not take donations down) but it means removing this migration
-- silently disables the control rather than causing a visible error.

BEGIN;

DROP FUNCTION IF EXISTS check_rate_limit(text, integer, integer);
DROP TABLE IF EXISTS rate_limits;

COMMIT;

NOTIFY pgrst, 'reload schema';
