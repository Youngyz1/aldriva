-- migration_139_tool_registry.sql
-- Phase 139: Tool Registry — persistent catalog for the 22 existing AI tools.
-- No executor changes. Existing SAFE_COLUMNS, SSRF/Input/Output guards remain authoritative.
-- Seed data is derived verbatim from lib/ai/tools/* Definition exports — no new invented tools.

BEGIN;

-- ── 1. tool_definitions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_definitions (
  name text PRIMARY KEY CHECK (name ~ '^[A-Za-z][A-Za-z0-9_]{2,50}$'),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL CHECK (scope IN ('public_read','tenant_scoped','transactional','admin')),
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  approval_required boolean NOT NULL DEFAULT false,
  executor_ref text NOT NULL CHECK (char_length(executor_ref) BETWEEN 3 AND 200),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tool_definitions IS 'Registry of every AI tool. Mirrors lib/ai/tools/* AIToolDefinition objects. Single source of truth for scope, risk, approval gates. Modifications require migration.';

CREATE OR REPLACE FUNCTION update_tool_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tool_definitions_updated_at ON tool_definitions;
CREATE TRIGGER trg_tool_definitions_updated_at
  BEFORE UPDATE ON tool_definitions
  FOR EACH ROW EXECUTE FUNCTION update_tool_definitions_updated_at();

ALTER TABLE tool_definitions ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (admin UI + gateway need catalog). No anon.
DROP POLICY IF EXISTS "Authenticated can read tool definitions" ON tool_definitions;
CREATE POLICY "Authenticated can read tool definitions"
  ON tool_definitions FOR SELECT
  USING (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies for anon/authenticated: writes via service_role only (approval-gated admin path).
-- Service role bypasses RLS.

-- ── 2. Seed — 22 existing tools (verbatim from lib/ai/tools-registry.ts) ──

-- Public catalog tools (8) — low risk, no approval
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('get_upcoming_events','Retrieves a list of upcoming approved public events on the Aldriva platform.','{"type":"object","properties":{"limit":{"type":"number"},"city":{"type":"string"},"category":{"type":"string"}},"required":[]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/get_upcoming_events:getUpcomingEvents'),
('get_active_fundraisers','Retrieves a list of active fundraisers on the Aldriva platform (those with a fundraising goal that has not yet been reached).','{"type":"object","properties":{"limit":{"type":"number"},"category":{"type":"string"},"min_progress_pct":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/get_active_fundraisers:getActiveFundraisers'),
('get_featured_businesses','Retrieves featured businesses on the Aldriva platform.','{"type":"object","properties":{"limit":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/get_featured_businesses:getFeaturedBusinesses'),
('get_recent_articles','Retrieves recent published articles on the Aldriva platform.','{"type":"object","properties":{"limit":{"type":"number"},"category":{"type":"string"}},"required":[]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/get_recent_articles:getRecentArticles'),
('get_available_products','Retrieves available products from the Aldriva marketplace.','{"type":"object","properties":{"limit":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/get_available_products:getAvailableProducts'),
('fetch_url_summary','Fetches public web content from a specified URL, runs SSRF security checks, screens for prompt injection attacks, and returns the quarantined content for summarization.','{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/fetch_url_summary:fetchUrlSummary'),
('fetch_rss_feed','Fetches and parses an RSS or Atom XML feed from a public URL, validates destinations via SSRF guard, and runs per-item prompt injection screening before returning clean items.','{"type":"object","properties":{"url":{"type":"string"},"maxItems":{"type":"number"}},"required":["url"]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/fetch_rss_feed:fetchRssFeed'),
('search_trends','Searches the live web for industry trends, news, and market intelligence. Screens all external snippets for prompt injections before returning quarantined results.','{"type":"object","properties":{"query":{"type":"string"},"maxResults":{"type":"number"}},"required":["query"]}'::jsonb,'{}'::jsonb,'public_read','low',false,'lib/ai/tools/search_trends:searchTrends')
ON CONFLICT (name) DO NOTHING;

-- Admin tool (1) — low risk but admin-gated via scope
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('get_content_history','Retrieves a history of AI-generated content items from the Aldriva AI system. Use to avoid repetition and track what was published.','{"type":"object","properties":{"limit":{"type":"number"},"content_type":{"type":"string"},"published_only":{"type":"boolean"},"days_back":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'admin','low',false,'lib/ai/tools/get_content_history:getContentHistory')
ON CONFLICT (name) DO NOTHING;

-- Tenant-scoped tools (11) — medium-low but tenant-isolated; transactional flagged approval_required
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('searchEvents','Searches events belonging to the current organizer tenant.','{"type":"object","properties":{"query":{"type":"string"},"city":{"type":"string"},"category":{"type":"string"},"limit":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-events:searchEvents'),
('getEvent','Gets one event of the current organizer tenant by id or slug.','{"type":"object","properties":{"id":{"type":"string"},"slug":{"type":"string"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-events:getEvent'),
('getTicketAvailability','Reads ticket tiers for one of the current tenants events.','{"type":"object","properties":{"eventId":{"type":"string"}},"required":["eventId"]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-events:getTicketAvailability'),
('getTicketOrderStatus','Reads the status of one ticket order of the current tenants event.','{"type":"object","properties":{"orderId":{"type":"string"}},"required":["orderId"]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-events:getTicketOrderStatus'),
('searchFundraisers','Searches fundraisers belonging to the current organizer tenant.','{"type":"object","properties":{"query":{"type":"string"},"category":{"type":"string"},"limit":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-fundraising:searchFundraisers'),
('getFundraiser','Gets one fundraiser of the current organizer tenant by id or slug.','{"type":"object","properties":{"id":{"type":"string"},"slug":{"type":"string"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-fundraising:getFundraiser'),
('getDonationStatus','Reads donation status for one of the current tenants fundraisers.','{"type":"object","properties":{"donationId":{"type":"string"}},"required":["donationId"]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-fundraising:getDonationStatus'),
('searchProducts','Searches products belonging to the current organizer tenant.','{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-products:searchProducts'),
('getProduct','Gets one product of the current organizer tenant by id or slug.','{"type":"object","properties":{"id":{"type":"string"},"slug":{"type":"string"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-products:getProduct'),
('getProductAvailability','Reads product availability for one of the current tenants products.','{"type":"object","properties":{"productId":{"type":"string"}},"required":["productId"]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-products:getProductAvailability'),
('getProductOrderStatus','Reads the status of one product order of the current tenant.','{"type":"object","properties":{"orderId":{"type":"string"}},"required":["orderId"]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-products:getProductOrderStatus'),
('getPaymentStatus','Reads payment status for the current tenant context.','{"type":"object","properties":{"paymentId":{"type":"string"}},"required":["paymentId"]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/tenant/tenant-payments:getPaymentStatus')
ON CONFLICT (name) DO NOTHING;

-- Transactional tools (2) — medium risk, preference-aware, side-effecting notifications
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('createNotification','Creates an in-app notification for one user of the current tenant. Delegates to existing notification service.','{"type":"object","properties":{"userId":{"type":"string"},"type":{"type":"string"},"title":{"type":"string"},"body":{"type":"string"},"link":{"type":"string"}},"required":["userId","type","title"]}'::jsonb,'{}'::jsonb,'transactional','medium',false,'lib/ai/tools/tenant/tenant-notifications:createTenantNotification'),
('notifyOwner','Notifies the current tenants owners (entity owner-role holders). Honors tenant notification_preferences.','{"type":"object","properties":{"type":{"type":"string"},"title":{"type":"string"},"body":{"type":"string"},"link":{"type":"string"},"channel":{"type":"string"},"eventType":{"type":"string"}},"required":["type","title"]}'::jsonb,'{}'::jsonb,'transactional','medium',false,'lib/ai/tools/tenant/tenant-notifications:notifyOwner')
ON CONFLICT (name) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
