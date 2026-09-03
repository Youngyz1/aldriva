/**
 * lib/ai/tools/get_featured_businesses.ts
 *
 * Safe-column allowlist tool: returns only the explicitly listed columns for
 * active/approved business listings. Based on migration_36_business_listings.sql
 * schema and Phase 0.5 report analysis.
 *
 * Safe columns:
 *   id, name, slug, description, logo, category, city, website
 *
 * Excluded (never sent to model):
 *   owner_id, stripe_account_id, email, phone, internal_notes,
 *   and any column added in future migrations not listed here.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
const SAFE_COLUMNS =
  'id, name, slug, description, logo, category, city, website' as const;

// ── Tool definition ───────────────────────────────────────────────────────────
export const getFeaturedBusinessesDefinition: AIToolDefinition = {
  name: 'get_featured_businesses',
  description:
    'Retrieves a list of active business listings on the Aldriva platform. ' +
    'Use this to find businesses to feature in content, promotions, or articles.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of businesses to return (default 10, max 20).',
      },
      category: {
        type: 'string',
        description: 'Optional category filter (e.g. "restaurant", "retail", "services").',
      },
      city: {
        type: 'string',
        description: 'Optional city filter.',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetFeaturedBusinessesArgs {
  limit?: number;
  category?: string;
  city?: string;
}

export interface FeaturedBusiness {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  category: string | null;
  city: string | null;
  website: string | null;
}

export async function getFeaturedBusinesses(
  args: GetFeaturedBusinessesArgs = {}
): Promise<FeaturedBusiness[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const limit = Math.min(args.limit ?? 10, 20);

  // ── Hard-coded allowlist SELECT — no select('*') ──────────────────────────
  // [V3 HOOK] Per-user isolation: add .eq('owner_id', requestingUserId) here
  // when V3 introduces business owners who can only surface their own listings.
  let query = supabase
    .from('businesses')
    .select(SAFE_COLUMNS)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.category) {
    query = query.eq('category', args.category);
  }

  if (args.city) {
    query = query.ilike('city', `%${args.city}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[get_featured_businesses] Database error: ${error.message}`);
  }

  const rows = (data ?? []) as FeaturedBusiness[];

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_featured_businesses', rows, 'business');
}
