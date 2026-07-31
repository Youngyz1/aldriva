-- migration_20_organizer_visibility_boost.sql
-- Adds follower_offset and events_offset columns to organizers table.
-- Creates organizer_visibility_audit table for logging admin updates.

-- 1. Add visibility offset columns to organizers
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS follower_offset INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS events_offset INTEGER NOT NULL DEFAULT 0;

-- 2. Create the visibility audit log table
CREATE TABLE IF NOT EXISTS organizer_visibility_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    field_name VARCHAR(50) NOT NULL CHECK (field_name IN ('follower_offset', 'events_offset')),
    old_value INTEGER NOT NULL,
    new_value INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Enable RLS on audit logs
ALTER TABLE organizer_visibility_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON organizer_visibility_audit;
CREATE POLICY "Admins can view audit logs"
ON organizer_visibility_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.status = 'active'
  )
);

-- Ask Supabase/PostgREST to refresh its schema cache after table and column changes.
NOTIFY pgrst, 'reload schema';
