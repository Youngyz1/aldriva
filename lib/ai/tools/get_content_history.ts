/**
 * lib/ai/tools/get_content_history.ts
 *
 * Safe-column allowlist tool: returns the history of AI-generated content
 * from ai_content_items (created in migration_88_aldriva_ai.sql). Used so
 * the model can avoid repeating recently promoted items.
 *
 * Safe columns from ai_content_items:
 *   id, content_type, source_id, generated_text, published, published_at,
 *   published_to, guard_result, created_at
 *
 * Excluded (never sent to model):
 *   snapshot (may contain raw DB row data), guard_flags (internal diagnostics),
 *   ai_provider, updated_at.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
const SAFE_COLUMNS =
  'id, content_type, source_id, generated_text, published, published_at, published_to, guard_result, created_at' as const;

// ── Tool definition ───────────────────────────────────────────────────────────
export const getContentHistoryDefinition: AIToolDefinition = {
  name: 'get_content_history',
  description:
    'Retrieves a history of AI-generated content items from the Aldriva AI system. ' +
    'Use this to see what has recently been promoted or generated, to avoid repetition ' +
    'and track what was published where.',
  // Admin-only source (ai_content_items is admin-RLS, migration_88): this
  // tool must only be offered on admin-gated routes, never on a
  // public/tenant surface. Sole execution path is the admin-gated
  // app/api/ai/chat route via executeAITool.
  scope: 'admin',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of history records to return (default 10, max 50).',
      },
      content_type: {
        type: 'string',
        description:
          'Filter by content type: "event", "fundraiser", "business", "article", or "product".',
      },
      published_only: {
        type: 'boolean',
        description:
          'If true, returns only items that were actually published externally.',
      },
      days_back: {
        type: 'number',
        description:
          'Only return items from the last N days (default 30).',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetContentHistoryArgs {
  limit?: number;
  content_type?: string;
  published_only?: boolean;
  days_back?: number;
}

export interface ContentHistoryItem {
  id: string;
  content_type: string;
  source_id: string;
  generated_text: string | null;
  published: boolean;
  published_at: string | null;
  published_to: string | null;
  guard_result: string;
  created_at: string;
}

export async function getContentHistory(
  args: GetContentHistoryArgs = {}
): Promise<ContentHistoryItem[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const limit = Math.min(args.limit ?? 10, 50);
  const daysBack = args.days_back ?? 30;
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  // ── Hard-coded allowlist SELECT — no select('*') ──────────────────────────
  // [V3 HOOK] Per-user isolation: add .eq('admin_id', requestingUserId) here
  // when V3 introduces multiple admins who should only see their own AI content history.
  let query = supabase
    .from('ai_content_items')
    .select(SAFE_COLUMNS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.content_type) {
    query = query.eq('content_type', args.content_type);
  }

  if (args.published_only) {
    query = query.eq('published', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[get_content_history] Database error: ${error.message}`);
  }

  const rows = (data ?? []) as ContentHistoryItem[];

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_content_history', rows);
}
