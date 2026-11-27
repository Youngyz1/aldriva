-- Rollback for migration 266. WARNING: deletes every planned shift. Dropping the table also drops its policies, triggers and indexes.
DROP TABLE IF EXISTS public.staff_shifts;
DROP FUNCTION IF EXISTS public.staff_shifts_validate();
