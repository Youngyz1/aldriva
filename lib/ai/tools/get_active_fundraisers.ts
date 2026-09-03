/**
 * lib/ai/tools/get_active_fundraisers.ts
 *
 * Safe-column allowlist tool: returns only the explicitly listed columns for
 * active fundraisers. "Active" = goal > 0 AND raised < goal AND deleted_at IS NULL.
 * This mirrors the filter logic in lib/promotionEngine.js fundraiserProvider.
 *
 * Safe columns (matches promotionEngine fundraiserProvider + Phase 0.5 report):
 *   id, title, slug, story, banner, goal, raised, category
 *
 * Excluded (never sent to model):
 *   organizer_id, created_by, donor emails, stripe fields, deleted_at,
 *   purge_at, internal_notes, and any future column not listed here.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
const SAFE_COLUMNS =
  'id, title, slug, story, banner, goal, raised, category' as const;

// ── Tool definition ───────────────────────────────────────────────────────────
export const getActiveFundraisersDefinition: AIToolDefinition = {
  name: 'get_active_fundraisers',
  description:
    'Retrieves a list of active fundraisers on the Aldriva platform (those with a ' +
    'fundraising goal that has not yet been reached). Use this to find fundraisers ' +
    'to promote, generate donation appeal captions for, or reference in content.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of fundraisers to return (default 10, max 20).',
      },
      category: {
        type: 'string',
        description: 'Optional category filter (e.g. "medical", "education", "community").',
      },
      min_progress_pct: {
        type: 'number',
        description:
          'Optional minimum percentage funded (0–99). E.g. 50 returns fundraisers ' +
          'at least 50% funded — useful for "almost there" appeal content.',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetActiveFundraisersArgs {
  limit?: number;
  category?: string;
  min_progress_pct?: number;
}

export interface ActiveFundraiser {
  id: string;
  title: string;
  slug: string;
  story: string | null;
  banner: string | null;
  goal: number;
  raised: number;
  category: string | null;
}

export async function getActiveFundraisers(
  args: GetActiveFundraisersArgs = {}
): Promise<ActiveFundraiser[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const limit = Math.min(args.limit ?? 10, 20);

  // ── Hard-coded allowlist SELECT — no select('*') ──────────────────────────
  // [V3 HOOK] Per-user isolation: add .eq('organizer_id', requestingUserId) here
  // before .limit() when V3 introduces end-users who can only see their own fundraisers.
  let query = supabase
    .from('fundraisers')
    .select(SAFE_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3); // Over-fetch to allow client-side active filter

  if (args.category) {
    query = query.eq('category', args.category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[get_active_fundraisers] Database error: ${error.message}`);
  }

  // Apply active filter (goal > 0 AND raised < goal) — matches promotionEngine
  let rows = ((data ?? []) as ActiveFundraiser[]).filter((row) => {
    const goal = Number(row.goal ?? 0);
    const raised = Number(row.raised ?? 0);
    return goal > 0 && raised < goal;
  });

  // Apply optional minimum progress filter
  if (args.min_progress_pct !== undefined) {
    const minPct = Math.max(0, Math.min(99, args.min_progress_pct));
    rows = rows.filter((row) => {
      const goal = Number(row.goal);
      const raised = Number(row.raised);
      const pct = goal > 0 ? (raised / goal) * 100 : 0;
      return pct >= minPct;
    });
  }

  // Trim to requested limit
  rows = rows.slice(0, limit);

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_active_fundraisers', rows, 'fundraiser');
}
