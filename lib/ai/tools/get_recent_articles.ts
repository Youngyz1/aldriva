/**
 * lib/ai/tools/get_recent_articles.ts
 *
 * Safe-column allowlist tool: returns only the explicitly listed columns for
 * published articles. Based on migration_28_articles_phase1.sql and
 * migration_35_articles_fixes.sql (categories is TEXT[], not TEXT).
 *
 * Safe columns:
 *   id, title, slug, excerpt, cover_image, categories, published_at, reading_time
 *
 * Excluded (never sent to model):
 *   author_id, created_by, scheduled_for, internal_notes, revision_history,
 *   and any column added in future migrations not listed here.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
// Note: 'categories' is TEXT[] (array) — confirmed by migration_35_articles_fixes.sql
const SAFE_COLUMNS =
  'id, title, slug, excerpt, cover_image, categories, published_at, reading_time' as const;

// ── Tool definition ───────────────────────────────────────────────────────────
export const getRecentArticlesDefinition: AIToolDefinition = {
  name: 'get_recent_articles',
  description:
    'Retrieves a list of recently published articles on the Aldriva platform. ' +
    'Use this to find articles to promote, reference in social content, or summarise.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of articles to return (default 10, max 20).',
      },
      category: {
        type: 'string',
        description:
          'Optional category filter. Articles use a TEXT[] column, so this checks ' +
          'whether the category string is contained in the categories array.',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetRecentArticlesArgs {
  limit?: number;
  category?: string;
}

export interface RecentArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  categories: string[];
  published_at: string | null;
  reading_time: number | null;
}

export async function getRecentArticles(
  args: GetRecentArticlesArgs = {}
): Promise<RecentArticle[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const limit = Math.min(args.limit ?? 10, 20);

  // ── Hard-coded allowlist SELECT — no select('*') ──────────────────────────
  // [V3 HOOK] Per-user isolation: add .eq('author_id', requestingUserId) here
  // when V3 introduces authors who can only surface their own articles.
  let query = supabase
    .from('articles')
    .select(SAFE_COLUMNS)
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (args.category) {
    // articles.categories is TEXT[] — use the contains operator
    query = query.contains('categories', [args.category]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[get_recent_articles] Database error: ${error.message}`);
  }

  const rows = (data ?? []) as RecentArticle[];

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_recent_articles', rows, 'article');
}
