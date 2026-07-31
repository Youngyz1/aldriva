-- migration_21_reviews_and_ratings.sql
-- PostgreSQL schema for Reviews & Ratings System, rating aggregates, and nonprofit support.

-- 1. Create the reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    fundraiser_id UUID REFERENCES fundraisers(id) ON DELETE CASCADE,
    organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    review TEXT,
    
    is_verified BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- At least one target must exist
    CONSTRAINT reviews_at_least_one_target CHECK (
        (event_id IS NOT NULL)::integer +
        (fundraiser_id IS NOT NULL)::integer +
        (organizer_id IS NOT NULL)::integer >= 1
    )
);

-- 2. Add partial unique indexes to prevent multiple reviews from same user for same target
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_event_review 
ON reviews (user_id, event_id) 
WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_fundraiser_review 
ON reviews (user_id, fundraiser_id) 
WHERE fundraiser_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_organizer_review 
ON reviews (user_id, organizer_id) 
WHERE organizer_id IS NOT NULL;

-- 3. Add aggregates columns to events, fundraisers, and organizers
ALTER TABLE events ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3, 2) DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

ALTER TABLE fundraisers ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3, 2) DEFAULT 0;
ALTER TABLE fundraisers ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

ALTER TABLE organizers ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3, 2) DEFAULT 0;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- 4. Add optional nonprofit support columns to organizers
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(255);
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS nonprofit_registration_number VARCHAR(255);

-- 5. Helper recalculate functions for triggers
CREATE OR REPLACE FUNCTION recalculate_event_rating(target_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE events
    SET 
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE event_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE event_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalculate_fundraiser_rating(target_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE fundraisers
    SET 
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE fundraiser_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE fundraiser_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalculate_organizer_rating(target_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE organizers
    SET 
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE organizer_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE organizer_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger function to update averages automatically when reviews change
CREATE OR REPLACE FUNCTION update_rating_aggregates()
RETURNS TRIGGER AS $$
DECLARE
    target_event_id UUID;
    target_fundraiser_id UUID;
    target_organizer_id UUID;
BEGIN
    -- Determine which targets to update based on operation
    IF TG_OP = 'DELETE' THEN
        target_event_id := OLD.event_id;
        target_fundraiser_id := OLD.fundraiser_id;
        target_organizer_id := OLD.organizer_id;
    ELSE
        target_event_id := NEW.event_id;
        target_fundraiser_id := NEW.fundraiser_id;
        target_organizer_id := NEW.organizer_id;
        
        -- If update changes the target, recalculate the old targets too
        IF TG_OP = 'UPDATE' THEN
            IF OLD.event_id IS DISTINCT FROM NEW.event_id AND OLD.event_id IS NOT NULL THEN
                PERFORM recalculate_event_rating(OLD.event_id);
            END IF;
            IF OLD.fundraiser_id IS DISTINCT FROM NEW.fundraiser_id AND OLD.fundraiser_id IS NOT NULL THEN
                PERFORM recalculate_fundraiser_rating(OLD.fundraiser_id);
            END IF;
            IF OLD.organizer_id IS DISTINCT FROM NEW.organizer_id AND OLD.organizer_id IS NOT NULL THEN
                PERFORM recalculate_organizer_rating(OLD.organizer_id);
            END IF;
        END IF;
    END IF;

    -- Recalculate new/current targets
    IF target_event_id IS NOT NULL THEN
        PERFORM recalculate_event_rating(target_event_id);
    END IF;
    IF target_fundraiser_id IS NOT NULL THEN
        PERFORM recalculate_fundraiser_rating(target_fundraiser_id);
    END IF;
    IF target_organizer_id IS NOT NULL THEN
        PERFORM recalculate_organizer_rating(target_organizer_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 7. Create the trigger on reviews table
DROP TRIGGER IF EXISTS trg_update_rating_aggregates ON reviews;
CREATE TRIGGER trg_update_rating_aggregates
AFTER INSERT OR UPDATE OF rating, is_approved, event_id, fundraiser_id, organizer_id OR DELETE
ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_rating_aggregates();

-- 8. Enable Row Level Security (RLS) on reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviews are publicly readable" ON reviews;
CREATE POLICY "Reviews are publicly readable"
ON reviews FOR SELECT
USING (is_approved = true OR auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
));

DROP POLICY IF EXISTS "Authenticated users can create reviews" ON reviews;
CREATE POLICY "Authenticated users can create reviews"
ON reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON reviews;
CREATE POLICY "Users can update their own reviews"
ON reviews FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reviews" ON reviews;
CREATE POLICY "Users can delete their own reviews"
ON reviews FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all reviews" ON reviews;
CREATE POLICY "Admins can manage all reviews"
ON reviews FOR ALL
USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
));

NOTIFY pgrst, 'reload schema';
