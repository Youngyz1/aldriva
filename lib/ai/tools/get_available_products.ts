/**
 * lib/ai/tools/get_available_products.ts
 *
 * Safe-column allowlist tool: returns only the explicitly listed columns for
 * available (in-stock, approved) digital products. Based on
 * migration_37_products.sql schema and Phase 0.5 report analysis.
 *
 * Safe columns:
 *   id, title, slug, description, cover_image, price, category, product_type
 *
 * Excluded (never sent to model):
 *   seller_id, stripe_price_id, stripe_product_id, download_url,
 *   file_path, internal_notes, and any column added in future migrations
 *   not listed here.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
const SAFE_COLUMNS =
  'id, title, slug, description, cover_image, price, category, product_type' as const;

// ── Tool definition ───────────────────────────────────────────────────────────
export const getAvailableProductsDefinition: AIToolDefinition = {
  name: 'get_available_products',
  description:
    'Retrieves a list of available digital products on the Aldriva platform. ' +
    'Use this to find products to promote, reference in content, or generate ' +
    'marketing copy for.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of products to return (default 10, max 20).',
      },
      category: {
        type: 'string',
        description: 'Optional category filter (e.g. "ebook", "course", "template").',
      },
      product_type: {
        type: 'string',
        description: 'Optional product type filter.',
      },
      max_price: {
        type: 'number',
        description: 'Optional maximum price filter (in platform currency units).',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetAvailableProductsArgs {
  limit?: number;
  category?: string;
  product_type?: string;
  max_price?: number;
}

export interface AvailableProduct {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  price: number;
  category: string | null;
  product_type: string | null;
}

export async function getAvailableProducts(
  args: GetAvailableProductsArgs = {}
): Promise<AvailableProduct[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const limit = Math.min(args.limit ?? 10, 20);

  // ── Hard-coded allowlist SELECT — no select('*') ──────────────────────────
  // [V3 HOOK] Per-user isolation: add .eq('seller_id', requestingUserId) here
  // when V3 introduces sellers who can only surface their own products.
  let query = supabase
    .from('products')
    .select(SAFE_COLUMNS)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.category) {
    query = query.eq('category', args.category);
  }

  if (args.product_type) {
    query = query.eq('product_type', args.product_type);
  }

  if (args.max_price !== undefined) {
    query = query.lte('price', args.max_price);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[get_available_products] Database error: ${error.message}`);
  }

  const rows = (data ?? []) as AvailableProduct[];

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_available_products', rows, 'product');
}
