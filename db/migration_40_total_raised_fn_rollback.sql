-- Rollback for migration 40: drop the total-raised aggregate function.
-- The application falls back to summing `raised` in Node when this function is
-- absent, so dropping it degrades performance but does not break the page.

drop function if exists public.get_total_raised();
