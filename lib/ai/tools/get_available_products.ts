/**
 * lib/ai/tools/get_available_products.ts
 *
 * Safe-column allowlist tool: returns only the explicitly listed columns for
 * live products. Aligned to the REAL products schema
 * (db/migration_37_products.sql + migration_38 status set):
 *
 * Safe columns:
 *   id, name, slug, description, price_type, stock_quantity, status
 *
 * Excluded (never sent to model):
 *   owner_id, business_id, stripe_price_id, images, seo_*, and any column
 *   added in future migrations not listed here. The charged price lives on
 *   product_orders snapshots / Stripe, not on products — there is no price
 *   column to expose.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
const SAFE_COLUMNS =
  'id, name, slug, description, price_type, stock_quantity, status' as const;

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
      price_type: {
        type: 'string',
        description: 'Optional price-type filter ("one_time" or "subscription").',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetAvailableProductsArgs {
  limit?: number;
  price_type?: string;
}

export interface AvailableProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_type: string | null;
  stock_quantity: number | null;
  status: string | null;
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
  const query = supabase
    .from('products')
    .select(SAFE_COLUMNS)
    .in('status', ['active', 'out_of_stock'])
    .order('created_at', { ascending: false })
    .limit(limit);

  const filtered =
    args.price_type !== undefined
      ? query.eq('price_type', args.price_type)
      : query;

  const { data, error } = await filtered;

  if (error) {
    throw new Error(`[get_available_products] Database error: ${error.message}`);
  }

  const rows = (data ?? []) as AvailableProduct[];

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_available_products', rows, 'product');
}
