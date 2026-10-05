-- migration_152_studio_chat_persistence.sql
-- Stage 22 (P4a): Studio chat persistence (DB + server only, NO UI).
--
-- New tables (no collision: ai_conversations/ai_messages from migration_88
-- are an admin-only audit log; tenant conversations/messages from
-- migration_111 are append-only member chat — neither is reusable here):
--   studio_chat_conversations — one row per admin chat thread, owned by
--     the admin who started it (user_id).
--   studio_chat_messages — the thread: user prompts and guarded assistant
--     replies. Stores display text, tool name, guard verdict/reason and
--     provider ONLY — never raw tool payload rows, quarantinedContent,
--     secrets, embeddings or full toolArgs.
--
-- RLS (owner-only): every operation on conversations requires an ACTIVE
-- ADMIN profile AND user_id = auth.uid() (same admin sub-select as
-- migration_151 S-1, plus ownership). Messages inherit scope through the
-- parent conversation via EXISTS (the 149/151 precedent). Grants follow the
-- migration_129 doctrine: REVOKE ALL from PUBLIC and anon first (Supabase
-- default privileges grant ALL on every new table to anon — see
-- docs/migration-audit/sql/008_grants.sql), then least-privilege to
-- authenticated (the four session-client DML ops only: TRUNCATE, REFERENCES
-- and TRIGGER stay revoked) and ALL to service_role. RLS still gates every
-- row; anon gets nothing.
--
-- Deletes: hard delete cascades MESSAGES ONLY (ON DELETE CASCADE, the 88/111
-- precedent). There is deliberately NO BEFORE DELETE trigger (unlike the
-- F-4 memory append-only guard) and NO reference from or to
-- system_events / agent_steps / ai_guard_rejections / incident_events:
-- deleting a chat never touches the audit trail (audit references chat via
-- nullable external ids at most, never the reverse).
--
-- Transactional + idempotent (IF NOT EXISTS / DROP IF EXISTS). No triggers.
--
-- Rollback: db/migration_152_studio_chat_persistence_rollback.sql drops both
-- tables (messages first), restoring the pre-152 schema exactly.

BEGIN;

-- ── Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_chat_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT 'Untitled chat',
  provider    text        NOT NULL DEFAULT 'gemini',
  status      text        NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_chat_conversations_provider_check
    CHECK (provider IN ('gemini', 'openrouter')),
  CONSTRAINT studio_chat_conversations_status_check
    CHECK (status IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS studio_chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES studio_chat_conversations(id) ON DELETE CASCADE,
  seq             integer     NOT NULL CHECK (seq >= 0),
  role            text        NOT NULL,
  content         text,
  tool_name       text,
  guard_verdict   text        NOT NULL DEFAULT 'pass',
  guard_reason    text,
  provider        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_chat_messages_role_check
    CHECK (role IN ('user', 'assistant', 'tool')),
  CONSTRAINT studio_chat_messages_guard_verdict_check
    CHECK (guard_verdict IN ('pass', 'sanitised', 'rejected')),
  CONSTRAINT studio_chat_messages_seq_unique
    UNIQUE (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_studio_chat_conversations_owner
  ON studio_chat_conversations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_chat_messages_conversation
  ON studio_chat_messages (conversation_id, seq);

-- ── Grants (migration_129 doctrine; RLS gates every row) ─────────────────
--
-- Supabase default privileges grant ALL on every new public table to anon
-- (docs/migration-audit/sql/008_grants.sql), so the GRANTs below are not
-- enough on their own: revoke first. Anon and PUBLIC get nothing. The
-- session client (chat + conversation routes) needs the four DML ops, so
-- authenticated keeps exactly SELECT/INSERT/UPDATE/DELETE — TRUNCATE,
-- REFERENCES and TRIGGER stay revoked (no session path needs them).

REVOKE ALL ON TABLE studio_chat_conversations FROM PUBLIC, anon;
REVOKE ALL ON TABLE studio_chat_messages FROM PUBLIC, anon;
REVOKE ALL ON TABLE studio_chat_conversations FROM authenticated;
REVOKE ALL ON TABLE studio_chat_messages FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE studio_chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE studio_chat_messages TO authenticated;
GRANT ALL ON TABLE studio_chat_conversations TO service_role;
GRANT ALL ON TABLE studio_chat_messages TO service_role;

-- ── RLS: owner-only (active admin AND user_id = auth.uid()) ───────────────

ALTER TABLE studio_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner admins can view studio chats" ON studio_chat_conversations;
CREATE POLICY "Owner admins can view studio chats"
  ON studio_chat_conversations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Owner admins can insert studio chats" ON studio_chat_conversations;
CREATE POLICY "Owner admins can insert studio chats"
  ON studio_chat_conversations FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Owner admins can update studio chats" ON studio_chat_conversations;
CREATE POLICY "Owner admins can update studio chats"
  ON studio_chat_conversations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    AND user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Owner admins can delete studio chats" ON studio_chat_conversations;
CREATE POLICY "Owner admins can delete studio chats"
  ON studio_chat_conversations FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    AND user_id = auth.uid()
  );

-- Messages inherit scope through the parent conversation (149/151 precedent).

DROP POLICY IF EXISTS "Owner admins can view studio chat messages" ON studio_chat_messages;
CREATE POLICY "Owner admins can view studio chat messages"
  ON studio_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM studio_chat_conversations c
      WHERE c.id = studio_chat_messages.conversation_id
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner admins can insert studio chat messages" ON studio_chat_messages;
CREATE POLICY "Owner admins can insert studio chat messages"
  ON studio_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM studio_chat_conversations c
      WHERE c.id = studio_chat_messages.conversation_id
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner admins can update studio chat messages" ON studio_chat_messages;
CREATE POLICY "Owner admins can update studio chat messages"
  ON studio_chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM studio_chat_conversations c
      WHERE c.id = studio_chat_messages.conversation_id
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM studio_chat_conversations c
      WHERE c.id = studio_chat_messages.conversation_id
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner admins can delete studio chat messages" ON studio_chat_messages;
CREATE POLICY "Owner admins can delete studio chat messages"
  ON studio_chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM studio_chat_conversations c
      WHERE c.id = studio_chat_messages.conversation_id
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        AND c.user_id = auth.uid()
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
