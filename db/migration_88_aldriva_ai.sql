-- migration_88_aldriva_ai.sql
-- Creates core tables for the Aldriva AI system:
--   ai_content_items   — a registry of every piece of content surfaced to the AI
--                        (events, fundraisers, businesses, articles, products).
--                        Records which items were promoted, when, and via what provider.
--   ai_conversations   — a session record every time an admin initiates an AI workflow.
--   ai_messages        — the message thread within a conversation (user prompts,
--                        assistant replies, tool calls, tool results).
--   ai_knowledge_docs  — manually curated documents the AI can query (brand voice,
--                        moderation guidelines, platform rules). Admin-managed only.
--
-- RLS pattern: copied exactly from migration_69_payment_reconciliation_failures.sql
-- (confirmed as the most complete instance of the admin-only gate):
--   EXISTS (
--     SELECT 1 FROM profiles
--     WHERE profiles.id = auth.uid()
--       AND profiles.role = 'admin'
--       AND profiles.status = 'active'
--   )
-- This is the same sub-select used in lib/auth.ts isAdmin() → requireAdmin().
-- No new pattern is introduced.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ai_content_items
--    Tracks every piece of platform content that was retrieved by an AI tool
--    call. Gives us an audit trail: what was shown to the model, when, and
--    what was eventually published as a result.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_content_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The type of content (matches promotionEngine provider types)
  content_type    text        NOT NULL,
  -- UUID of the originating record in its source table (events.id, fundraisers.id, …)
  source_id       uuid        NOT NULL,
  -- Snapshot of the safe, allowlisted fields returned to the model at retrieval time
  snapshot        jsonb       NOT NULL DEFAULT '{}',
  -- The AI provider that consumed this item (ollama | openrouter)
  ai_provider     text,
  -- The caption / content that was generated for this item (if any)
  generated_text  text,
  -- Whether this item's generated content was published externally
  published       boolean     NOT NULL DEFAULT false,
  published_at    timestamptz,
  published_to    text,       -- e.g. 'facebook', 'internal_only'
  -- Output-guard result: 'pass' | 'flagged' | 'rejected'
  guard_result    text        NOT NULL DEFAULT 'pass',
  guard_flags     jsonb,      -- populated when guard_result != 'pass'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_content_items_content_type_check
    CHECK (content_type IN ('event', 'fundraiser', 'business', 'article', 'product')),
  CONSTRAINT ai_content_items_guard_result_check
    CHECK (guard_result IN ('pass', 'flagged', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_ai_content_items_content_type
  ON ai_content_items (content_type);

CREATE INDEX IF NOT EXISTS idx_ai_content_items_source_id
  ON ai_content_items (source_id);

CREATE INDEX IF NOT EXISTS idx_ai_content_items_created_at
  ON ai_content_items (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_content_items_published
  ON ai_content_items (published)
  WHERE published = true;

CREATE INDEX IF NOT EXISTS idx_ai_content_items_flagged
  ON ai_content_items (guard_result)
  WHERE guard_result != 'pass';

ALTER TABLE ai_content_items ENABLE ROW LEVEL SECURITY;

-- Admins only — full CRUD (service role bypasses RLS for automated pipeline writes)
CREATE POLICY "Admins can view ai_content_items" ON ai_content_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can insert ai_content_items" ON ai_content_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can update ai_content_items" ON ai_content_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can delete ai_content_items" ON ai_content_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ai_conversations
--    One row per admin-initiated AI session. Carries enough context to replay
--    or audit any workflow that resulted in published content.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The admin who started this conversation (references auth.users)
  admin_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Human-readable label (e.g. "Facebook post — weekly fundraiser push")
  title           text,
  -- The AI provider used for this conversation
  ai_provider     text        NOT NULL DEFAULT 'ollama',
  -- Workflow type — what was this session trying to do?
  workflow_type   text        NOT NULL DEFAULT 'general',
  -- Terminal status of this conversation
  status          text        NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_conversations_status_check
    CHECK (status IN ('active', 'completed', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_admin_id
  ON ai_conversations (admin_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at
  ON ai_conversations (created_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_conversations" ON ai_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can insert ai_conversations" ON ai_conversations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can update ai_conversations" ON ai_conversations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ai_messages
--    Individual turns within an ai_conversation. Stores both user prompts and
--    model responses, as well as tool calls and their results.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  -- Role matches the AIMessage type in lib/ai/types.ts
  role            text        NOT NULL,
  content         text,
  -- For tool-call messages: the name of the tool called
  tool_name       text,
  -- Raw tool call arguments / results stored as JSON
  tool_payload    jsonb,
  -- Output-guard screening result for this specific message
  guard_result    text        NOT NULL DEFAULT 'pass',
  guard_flags     jsonb,
  -- Token usage (populated for model response messages, null for user/tool messages)
  token_count     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_messages_role_check
    CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  CONSTRAINT ai_messages_guard_result_check
    CHECK (guard_result IN ('pass', 'flagged', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id
  ON ai_messages (conversation_id, created_at);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_messages" ON ai_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can insert ai_messages" ON ai_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ai_knowledge_docs
--    Curated reference documents the AI can retrieve (brand voice guide,
--    moderation rules, posting guidelines, platform FAQs, etc.).
--    Writes are admin-only. No user-facing queries allowed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_knowledge_docs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical category (e.g. 'brand_voice', 'moderation', 'posting_guidelines')
  category        text        NOT NULL,
  title           text        NOT NULL,
  content         text        NOT NULL,
  -- Tags for retrieval filtering
  tags            text[]      NOT NULL DEFAULT ARRAY[]::text[],
  -- Whether this doc is currently active / retrievable by the AI
  active          boolean     NOT NULL DEFAULT true,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_docs_category
  ON ai_knowledge_docs (category)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_docs_tags
  ON ai_knowledge_docs USING GIN (tags)
  WHERE active = true;

ALTER TABLE ai_knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_knowledge_docs" ON ai_knowledge_docs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can insert ai_knowledge_docs" ON ai_knowledge_docs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can update ai_knowledge_docs" ON ai_knowledge_docs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can delete ai_knowledge_docs" ON ai_knowledge_docs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. updated_at triggers (reuse standard pattern)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ai_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_content_items_updated_at
  BEFORE UPDATE ON ai_content_items
  FOR EACH ROW EXECUTE FUNCTION ai_set_updated_at();

CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION ai_set_updated_at();

CREATE TRIGGER ai_knowledge_docs_updated_at
  BEFORE UPDATE ON ai_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION ai_set_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
