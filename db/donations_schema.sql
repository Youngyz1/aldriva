-- donations_schema.sql
-- PostgreSQL schema setup for donations

-- 1. Create the donations table
CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fundraiser_id UUID NOT NULL REFERENCES fundraisers(id) ON DELETE CASCADE,
    donor_name VARCHAR(255) DEFAULT 'Anonymous',
    donor_email VARCHAR(255),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
    payment_intent_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- If the table already existed before these fields were added, patch it in-place.
ALTER TABLE donations
ADD COLUMN IF NOT EXISTS donor_name VARCHAR(255) DEFAULT 'Anonymous';

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS donor_email VARCHAR(255);

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'succeeded';

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'donations_status_check'
          AND conrelid = 'donations'::regclass
    ) THEN
        ALTER TABLE donations
        ADD CONSTRAINT donations_status_check
        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded'));
    END IF;
END;
$$;

-- 2. Create index on fundraiser_id for optimal querying on campaign pages
CREATE INDEX IF NOT EXISTS idx_donations_fundraiser_id ON donations(fundraiser_id);
CREATE INDEX IF NOT EXISTS idx_donations_payment_intent_id ON donations(payment_intent_id);

-- 3. Create function and trigger to automatically update fundraiser's total raised amount
CREATE OR REPLACE FUNCTION update_fundraiser_raised()
RETURNS TRIGGER AS $$
DECLARE
    target_fundraiser_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_fundraiser_id := OLD.fundraiser_id;
    ELSE
        target_fundraiser_id := NEW.fundraiser_id;
    END IF;

    UPDATE fundraisers
    SET raised = COALESCE((
        SELECT SUM(amount)
        FROM donations
        WHERE fundraiser_id = target_fundraiser_id AND status = 'succeeded'
    ), 0)
    WHERE id = target_fundraiser_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate raised funds after insertions, updates, or deletions
CREATE OR REPLACE TRIGGER trg_update_fundraiser_raised
AFTER INSERT OR UPDATE OF amount, status OR DELETE
ON donations
FOR EACH ROW
EXECUTE FUNCTION update_fundraiser_raised();

-- Ask Supabase/PostgREST to refresh its schema cache after column changes.
NOTIFY pgrst, 'reload schema';
