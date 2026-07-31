-- migration_47_gofundme_source_columns.sql
-- Same bug class as migration_46, in the GoFundMe sync path:
-- app/api/gofundme-sync/route.ts's first-time-sync dedup check queries
-- fundraisers.source_url, which has never existed as a column. The query
-- errors silently (the code only destructures `{ data: existing }`,
-- discarding the error), so `existing` is always null on a first-time sync,
-- and the insert's "missing optional column" fallback silently drops both
-- fields on every synced fundraiser.
--
-- Narrower blast radius than the Eventbrite bug: once a source successfully
-- links to a fundraiser (gofundme_sources.fundraiser_id gets set), every
-- later sync updates by that id directly and never revisits the broken
-- check. It only bites a first-time sync, or one where that link is lost —
-- still a live risk worth closing properly since gofundme_source_id is used
-- as the dedup key going forward.

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS gofundme_source_id uuid REFERENCES gofundme_sources(id) ON DELETE SET NULL;

-- Backfill the fundraisers that already have a confirmed 1:1 link via
-- gofundme_sources.fundraiser_id, so dedup covers them going forward too.
UPDATE fundraisers f
SET source_url = gs.source_url,
    gofundme_source_id = gs.id
FROM gofundme_sources gs
WHERE gs.fundraiser_id = f.id;

-- Real dedup guarantee at the DB level, not just app-side. Partial (WHERE
-- gofundme_source_id IS NOT NULL) so native Aldriva fundraisers and other
-- import paths, which leave this null, are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS fundraisers_gofundme_source_id_key
  ON fundraisers(gofundme_source_id)
  WHERE gofundme_source_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
