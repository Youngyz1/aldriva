-- Fix raised amount trigger
CREATE OR REPLACE FUNCTION update_fundraiser_raised()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE fundraisers
  SET raised_amount = (
    SELECT COALESCE(SUM(amount), 0)
    FROM donations
    WHERE fundraiser_id = NEW.fundraiser_id
    AND status = 'completed'
  )
  WHERE id = NEW.fundraiser_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_fundraiser_raised ON donations;

CREATE TRIGGER trg_update_fundraiser_raised
AFTER INSERT OR UPDATE ON donations
FOR EACH ROW
EXECUTE FUNCTION update_fundraiser_raised();

-- Add missing donor columns
ALTER TABLE donations
ADD COLUMN IF NOT EXISTS donor_name text,
ADD COLUMN IF NOT EXISTS donor_email text,
ADD COLUMN IF NOT EXISTS message text;

ALTER TABLE fundraisers
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS raised_amount numeric DEFAULT 0;

-- Add fundraiser media table
CREATE TABLE IF NOT EXISTS fundraiser_media (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fundraiser_id uuid REFERENCES fundraisers(id) ON DELETE CASCADE,
  url text NOT NULL,
  type text DEFAULT 'image' CHECK (type IN ('image', 'video')),
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add fundraiser updates table
CREATE TABLE IF NOT EXISTS fundraiser_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fundraiser_id uuid REFERENCES fundraisers(id) ON DELETE CASCADE,
  organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS fundraiser_media
ALTER TABLE fundraiser_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view fundraiser media" ON fundraiser_media;
CREATE POLICY "Public can view fundraiser media"
ON fundraiser_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Organizer can manage their fundraiser media" ON fundraiser_media;
CREATE POLICY "Organizer can manage their fundraiser media"
ON fundraiser_media FOR ALL
USING (
  fundraiser_id IN (
    SELECT id FROM fundraisers WHERE organizer_id IN (
      SELECT id FROM organizers WHERE user_id = auth.uid()
    )
  )
);

-- RLS fundraiser_updates
ALTER TABLE fundraiser_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view fundraiser updates" ON fundraiser_updates;
CREATE POLICY "Public can view fundraiser updates"
ON fundraiser_updates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Organizer can manage their updates" ON fundraiser_updates;
CREATE POLICY "Organizer can manage their updates"
ON fundraiser_updates FOR ALL
USING (
  organizer_id IN (
    SELECT id FROM organizers WHERE user_id = auth.uid()
  )
);

-- Compatibility with the existing app schema.
ALTER TABLE donations
DROP CONSTRAINT IF EXISTS donations_status_check;

ALTER TABLE donations
ADD CONSTRAINT donations_status_check
CHECK (status IN ('pending', 'succeeded', 'completed', 'failed', 'refunded'));

UPDATE donations
SET status = 'completed'
WHERE status = 'succeeded';

ALTER TABLE fundraiser_media
ADD COLUMN IF NOT EXISTS url text,
ADD COLUMN IF NOT EXISTS type text DEFAULT 'image' CHECK (type IN ('image', 'video')),
ADD COLUMN IF NOT EXISTS position integer DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraiser_media'
      AND column_name = 'image_url'
  ) THEN
    UPDATE fundraiser_media
    SET url = image_url
    WHERE url IS NULL
      AND image_url IS NOT NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_fundraiser_media_position
ON fundraiser_media(fundraiser_id, position);

CREATE INDEX IF NOT EXISTS idx_fundraiser_updates_fundraiser_created
ON fundraiser_updates(fundraiser_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_fundraiser_raised()
RETURNS TRIGGER AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total
  FROM donations
  WHERE fundraiser_id = NEW.fundraiser_id
    AND status = 'completed';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraisers'
      AND column_name = 'raised'
  ) THEN
    UPDATE fundraisers
    SET raised = total
    WHERE id = NEW.fundraiser_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraisers'
      AND column_name = 'raised_amount'
  ) THEN
    UPDATE fundraisers
    SET raised_amount = total
    WHERE id = NEW.fundraiser_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
