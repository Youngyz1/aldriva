-- migration_29_donations_comments_rls.sql
-- Enable RLS for donations/comments and close direct client writes.

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read donations" ON donations;
CREATE POLICY "Admins can read donations"
  ON donations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Donations are server-managed inserts" ON donations;
DROP POLICY IF EXISTS "Donations are server-managed updates" ON donations;
DROP POLICY IF EXISTS "Donations are server-managed deletes" ON donations;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved comments are publicly readable" ON comments;
CREATE POLICY "Approved comments are publicly readable"
  ON comments FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "Admins can manage comments" ON comments;
CREATE POLICY "Admins can manage comments"
  ON comments FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Public can insert comments" ON comments;
DROP POLICY IF EXISTS "Public can update comments" ON comments;
DROP POLICY IF EXISTS "Public can delete comments" ON comments;

NOTIFY pgrst, 'reload schema';
