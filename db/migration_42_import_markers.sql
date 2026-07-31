-- migration_42_import_markers.sql
-- Provenance + display columns for the admin "import historical donors &
-- comments" feature (Step 3). Imported donor rows go into `donations`
-- (status='completed', so the existing trg_update_fundraiser_raised trigger
-- recomputes `raised` from their sum); imported Words-of-Support go into
-- `comments`.
--
-- No RLS changes are needed: neither `donations` nor `comments` has any
-- user-facing write policy, so imported rows are already immutable through the
-- normal UI — only the service-role admin import route can create them.

-- ── donations ──────────────────────────────────────────────────────────────
-- `source` marks provenance: 'stripe' for real payments (the only prior path),
-- 'imported' for admin imports. Internal/debug only — never surfaced publicly.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'stripe';
-- Groups all rows created by one paste, for audit and one-click undo of a batch.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS import_batch_id uuid;

-- ── comments ───────────────────────────────────────────────────────────────
-- 'donation' = mirrored from a donation message by the Stripe webhook (the
-- dominant existing source); 'imported' = admin import. Internal/debug only.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'donation';
-- Imported like counts (optional in the paste; defaults to 0).
ALTER TABLE comments ADD COLUMN IF NOT EXISTS likes integer NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS import_batch_id uuid;

-- Partial indexes so listing/undoing an import batch is cheap without adding
-- overhead to the (far more common) non-imported rows.
CREATE INDEX IF NOT EXISTS idx_donations_import_batch
  ON donations(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_import_batch
  ON comments(import_batch_id) WHERE import_batch_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
