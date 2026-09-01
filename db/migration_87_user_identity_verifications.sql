-- migration_87_user_identity_verifications.sql
-- Personal User Identity Verification Infrastructure (Part B)
--
-- Adds user_identity_verifications table (full submission history per user),
-- private storage bucket user-identity-docs with correct RLS and bucket-level limits,
-- and self-approval guard trigger preventing non-admins from self-verifying.

BEGIN;

-- 1. Submissions Table
CREATE TABLE IF NOT EXISTS user_identity_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'needs_more_info')),
  id_type TEXT CHECK (id_type IN ('national_id', 'passport', 'drivers_license')),
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitter_notes TEXT,
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying user's latest submission
CREATE INDEX IF NOT EXISTS idx_user_identity_verifications_user_id
  ON user_identity_verifications(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE user_identity_verifications ENABLE ROW LEVEL SECURITY;

-- User SELECT: Can view own submissions
DROP POLICY IF EXISTS "User can view own identity submissions" ON user_identity_verifications;
CREATE POLICY "User can view own identity submissions"
  ON user_identity_verifications FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- User INSERT: Can create draft submissions for self
DROP POLICY IF EXISTS "User can insert own draft identity submission" ON user_identity_verifications;
CREATE POLICY "User can insert own draft identity submission"
  ON user_identity_verifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'draft'
  );

-- User UPDATE: Can update own draft or needs_more_info submission
DROP POLICY IF EXISTS "User can update own draft identity submission" ON user_identity_verifications;
CREATE POLICY "User can update own draft identity submission"
  ON user_identity_verifications FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status IN ('draft', 'needs_more_info')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('draft', 'submitted')
  );

-- 2. Guard Trigger: Prevent non-admin self-approval or setting review fields
CREATE OR REPLACE FUNCTION prevent_user_identity_self_approval()
RETURNS TRIGGER AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- If review outcome columns or status approved/rejected/needs_more_info are set:
  IF (NEW.status IN ('approved', 'rejected', 'needs_more_info') AND OLD.status NOT IN ('approved', 'rejected', 'needs_more_info'))
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    ) INTO is_admin;

    is_admin := is_admin OR (auth.role() = 'service_role') OR (auth.uid() IS NULL);

    IF NOT is_admin THEN
      RAISE EXCEPTION 'Only an administrator can approve, reject, or set review fields on identity verifications.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_user_identity_self_approval ON user_identity_verifications;
CREATE TRIGGER trg_prevent_user_identity_self_approval
  BEFORE UPDATE ON user_identity_verifications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_user_identity_self_approval();

-- 3. Storage Bucket & Bucket-Level Restrictions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-identity-docs',
  'user-identity-docs',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS: Qualified storage.objects.name pattern
DROP POLICY IF EXISTS "User can read own identity docs" ON storage.objects;
CREATE POLICY "User can read own identity docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-identity-docs'
    AND (
      (storage.foldername(storage.objects.name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
          AND profiles.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "User can upload own identity docs" ON storage.objects;
CREATE POLICY "User can upload own identity docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-identity-docs'
    AND (storage.foldername(storage.objects.name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "User can delete own draft identity docs" ON storage.objects;
CREATE POLICY "User can delete own draft identity docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-identity-docs'
    AND (storage.foldername(storage.objects.name))[1] = auth.uid()::text
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
