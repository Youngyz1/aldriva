-- migration_22_donation_receipt_paths.sql
-- Add receipt_path and certificate_path columns to donations table for PDF storage tracking.

ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_path VARCHAR(512);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS certificate_path VARCHAR(512);

NOTIFY pgrst, 'reload schema';
