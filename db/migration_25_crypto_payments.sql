-- migration_25_crypto_payments.sql
-- Run this in your Supabase SQL editor to support crypto payments

-- 1. Add payment_method to donations table
ALTER TABLE donations 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'stripe';

-- 2. Add payment_method to ticket_orders table
ALTER TABLE ticket_orders 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'stripe';

-- 3. Modify check constraint on ticket_orders status to allow 'pending'
ALTER TABLE ticket_orders 
DROP CONSTRAINT IF EXISTS ticket_orders_status_check;

ALTER TABLE ticket_orders 
ADD CONSTRAINT ticket_orders_status_check 
CHECK (status IN ('pending', 'valid', 'used', 'cancelled', 'refunded'));

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
