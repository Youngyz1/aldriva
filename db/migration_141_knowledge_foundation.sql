-- migration_141_knowledge_foundation.sql
-- Phase 141: Knowledge Foundation — trigram/FTS retrieval without pgvector.
-- Extends (does not replace) existing ai_knowledge_docs. New tables are knowledge_documents/chunks/versions.
-- Retrieval uses tsvector (english) + pg_trgm fallback (extension already available in Supabase).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. knowledge_documents ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'company','domain','agent_role','sop','policy','security',
    'architecture','database','api_tool','codebase','ui_route',
    'incident','qa','agent_memory','operational','brand','moderation'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 300),
  content text NOT NULL CHECK (char_length(content) BETWEEN 10 AND 100000),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','proposed','approved','deprecated')),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_type text NOT NULL DEFAULT 'human' CHECK (source_type IN ('human','system','code-derived','agent-generated')),
  source_hash text,
  source_ref text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE knowledge_documents IS 'Canonical knowledge store. Tenant_id NULL = platform-wide. Versioned via knowledge_document_versions. Retrieval scoped to tenant_id IS NULL OR tenant_id = run.tenant_id.';
COMMENT ON COLUMN knowledge_documents.tenant_id IS 'NULL for platform knowledge. Tenant-scoped knowledge isolated per organizers.id.';
COMMENT ON COLUMN knowledge_documents.category IS '15 kinds from the operating spec — company, domain, agent_role, sop, policy, security, architecture, database, api_tool, codebase, ui_route, incident, qa, agent_memory, operational, brand, moderation.';

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_id ON knowledge_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category ON knowledge_documents(category) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tags ON knowledge_documents USING GIN (tags) WHERE status = 'approved';
-- GIN tsv for FTS (created via trigger on chunks, but document-level tsv also materialized for fast listing)
-- Chunks carry per-chunk tsv; this documents index accelerates category listing
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_title_trgm ON knowledge_documents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_content_trgm ON knowledge_documents USING gin (content gin_trgm_ops);

CREATE OR REPLACE FUNCTION update_knowledge_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER trg_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_documents_updated_at();

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read approved knowledge" ON knowledge_documents;
CREATE POLICY "Authenticated can read approved knowledge"
  ON knowledge_documents FOR SELECT
  USING (
    status = 'approved' AND (
      tenant_id IS NULL
      OR tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    )
  );

DROP POLICY IF EXISTS "Admins and owners can read all knowledge" ON knowledge_documents;
CREATE POLICY "Admins and owners can read all knowledge"
  ON knowledge_documents FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- Writes via service_role only

-- ── 2. knowledge_document_versions — immutable history ──────────────────
CREATE TABLE IF NOT EXISTS knowledge_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

COMMENT ON TABLE knowledge_document_versions IS 'Immutable snapshot on each title/content change. Version from knowledge_documents.version.';
CREATE INDEX IF NOT EXISTS idx_knowledge_document_versions_document_id ON knowledge_document_versions(document_id, version DESC);
ALTER TABLE knowledge_document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read knowledge versions" ON knowledge_document_versions;
CREATE POLICY "Authenticated can read knowledge versions"
  ON knowledge_document_versions FOR SELECT USING (auth.role() = 'authenticated');

-- ── 3. knowledge_chunks — section-level retrieval units ─────────────────
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
  chunk_index int NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL CHECK (char_length(content) BETWEEN 10 AND 5000),
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

COMMENT ON TABLE knowledge_chunks IS 'Chunk-level retrieval. Phase 1: tsv (english). Phase 2 may add pgvector support — no schema break.';

CREATE OR REPLACE FUNCTION knowledge_chunks_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_chunks_tsv ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_tsv
  BEFORE INSERT OR UPDATE OF content ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_tsv_trigger();

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id ON knowledge_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv ON knowledge_chunks USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_trgm ON knowledge_chunks USING gin(content gin_trgm_ops);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read chunks" ON knowledge_chunks;
CREATE POLICY "Authenticated can read chunks"
  ON knowledge_chunks FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ── 4. Seed — approved platform sources (not fabricated policy) ─────────
-- Minimal curated seeds: architecture excerpt + DEC-0002 + DEC-0003 + tool registry summary
-- Content is verbatim summaries with source_ref attribution; not invented business rules.

INSERT INTO knowledge_documents (category, title, content, tags, status, source_type, source_ref) VALUES
('architecture','Aldriva System Architecture — Tenant and Entity Model','Aldriva unifies organizations, businesses, venues, and campaigns around a single tenant identity: organizers.id is the canonical Entity / Tenant Root. Membership is governed by entity_members with roles owner, admin, manager, editor, finance, viewer. RLS enforcement uses is_entity_member(tenant_id, allowed_roles) Postgres function. Server context resolution lives in lib/tenant-context.ts and lib/entity-auth.ts and must never trust client parameters. See docs/ARCHITECTURE.md and DEC-0003.','{architecture,tenant,entity_members}'::text[],'approved','system','docs/ARCHITECTURE.md#4'),
('security','ADR-0002 — AI Output Validation Standing Requirement','LLM models are never trusted to self-police. Every AI tool must use a hard-coded safe column projection (SAFE_COLUMNS) — SELECT * is prohibited. Every string generated by the model must pass through guardBeforeDisplay() (lib/ai/output-guard.ts) before rendering in admin UI or dispatch to external publishing (e.g. Facebook Graph API). Flags and rejections are persisted to ai_guard_rejections and surfaced at /admin/ai/rejections. Input screening: lib/ai/input-guard.ts quarantines untrusted external content and wraps it in structural delimiters. SSRF Guard: lib/ssrf-guard.ts validates DNS before connecting and re-validates every redirect hop. See docs/DECISIONS.md ADR-0002 and ADR-0002 file.','{security,adr-0002,guard,allowlist}'::text[],'approved','system','docs/DECISIONS.md#ADR-0002'),
('architecture','DEC-0003 — Canonical Tenant Unification (organizers.id)','Rather than creating separate tenant tables per vertical, organizers.id serves as canonical Entity/Tenant root. Access delegation via entity_members with standardized roles owner, admin, manager, editor, finance, viewer. RLS policies enforce isolation via is_entity_member(tenant_id, roles). Tenant identity is rooted in organizers.id and must not be derived from model output (lib/tenant-context.ts). See docs/DECISIONS.md DEC-0003.','{architecture,tenant,dec-0003}'::text[],'approved','system','docs/DECISIONS.md#DEC-0003'),
('api_tool','Aldriva AI Tool Registry — 22 Tools (Phase 139)','The Aldriva AI Growth Studio exposes 22 controlled tools. Public catalog (8): get_upcoming_events, get_active_fundraisers, get_featured_businesses, get_recent_articles, get_available_products, fetch_url_summary, fetch_rss_feed, search_trends — scope public_read, risk low. Admin (1): get_content_history — scope admin, reads ai_content_items with safe columns. Tenant-scoped (11): searchEvents, getEvent, getTicketAvailability, getTicketOrderStatus, searchFundraisers, getFundraiser, getDonationStatus, searchProducts, getProduct, getProductAvailability, getProductOrderStatus, getPaymentStatus — scope tenant_scoped, require server-derived TenantToolContext, never model-supplied tenant_id. Transactional (2): createNotification, notifyOwner — scope transactional, risk medium, delegate to lib/notifications.ts and honor notification_preferences. Every tool enforces SAFE_COLUMNS and screenToolResult(). See lib/ai/tools-registry.ts and lib/ai/tools/* and db/migration_139_tool_registry.sql.','{api,tools,registry,allowlist}'::text[],'approved','system','lib/ai/tools-registry.ts'),
('architecture','Proxy Pre-Stream Status Gates (Next.js 16)','Next.js 16 App Router flushes HTTP 200 headers before downstream notFound() executes, so Aldriva enforces content status gates in proxy.ts before streaming. Lightweight REST fetches via service role check articles/businesses/products/ticketmaster/website status (published/active/archived) and rewrite unentitled responses to /_not-found with 404. See proxy.ts and DEC-0004.','{architecture,proxy,caching}'::text[],'approved','system','proxy.ts'),
('security','Three-Tier Client Separation and Rate Limits','Client components use lib/supabase.ts (browser, RLS). Server components and authenticated actions use lib/supabase-server.ts (cookie context). Service role lib/supabase-admin.ts is privileged and must never be imported into client components. Rate limiting is Postgres-backed via check_rate_limit RPC (migration_54) with per-endpoint budgets: articleAi 30/60s, seatingAi 15/60s — reused for AI Gateway. See docs/DECISIONS.md DEC-0005 and lib/rate-limit.ts.','{security,rls,rate-limit}'::text[],'approved','system','lib/rate-limit.ts')
ON CONFLICT DO NOTHING;

-- Chunks: one chunk per document (content as single chunk for MVP; future: split 1000-char windows)
INSERT INTO knowledge_chunks (document_id, tenant_id, chunk_index, content)
SELECT id, tenant_id, 0, content FROM knowledge_documents
WHERE source_ref IN ('docs/ARCHITECTURE.md#4','docs/DECISIONS.md#ADR-0002','docs/DECISIONS.md#DEC-0003','lib/ai/tools-registry.ts','proxy.ts','lib/rate-limit.ts')
ON CONFLICT (document_id, chunk_index) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
