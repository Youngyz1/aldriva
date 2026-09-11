/**
 * lib/ai/tools/tenant/tenant-products.ts
 *
 * Tenant-scoped product tools. Products resolve tenant via
 * product.business_id -> businesses.organizer_id -> organizers.id
 * (businesses.organizer_id auto-created by ensure_business_organizer(),
 * migration_58; verified 0 NULLs before this phase). Products with NULL
 * business_id carry no tenant and are invisible here (fail closed).
 * Read-only; results pass through screenToolResult().
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import {
  TenantToolContext,
  logToolInvocation,
  requireToolContext,
} from './tool-context';

// Actual products columns per migration_37 (+38 status). No price column
// exists on products — the charged price lives on product_orders snapshots.
const SAFE_PRODUCT_COLUMNS =
  'id, name, slug, description, price_type, stock_quantity, status, business_id' as const;

const SAFE_PRODUCT_ORDER_COLUMNS =
  'id, product_id, quantity, total_amount, currency, status, payment_method, created_at' as const;

export const searchProductsDefinition: AIToolDefinition = {
  name: 'searchProducts',
  description: 'Searches products of the current organizer tenant (via their businesses). Products without a business link are excluded.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional text search on product names.' },
      limit: { type: 'number', description: 'Max results (default 10, max 20).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export const getProductDefinition: AIToolDefinition = {
  name: 'getProduct',
  description: 'Gets one product of the current organizer tenant by id or slug. Fails closed for other tenants\' products.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Product id (uuid).' },
      slug: { type: 'string', description: 'Product slug.' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export const getProductAvailabilityDefinition: AIToolDefinition = {
  name: 'getProductAvailability',
  description: 'Reads stock/status availability for one of the current tenant\'s products. Read-only.',
  parameters: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'Product id (uuid) within the current tenant.' },
    },
    required: ['productId'],
  },
  scope: 'tenant_scoped',
};

export const getProductOrderStatusDefinition: AIToolDefinition = {
  name: 'getProductOrderStatus',
  description: 'Reads the status of one product order for the current tenant. Read-only; never confirms payment.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Product order id (uuid).' },
    },
    required: ['orderId'],
  },
  scope: 'tenant_scoped',
};

/** Business ids owned by this tenant (businesses.organizer_id = tenantId). */
async function tenantBusinessIds(tenantId: string): Promise<string[]> {
  const { data, error } = await createSupabaseAdmin()
    .from('businesses')
    .select('id')
    .eq('organizer_id', tenantId);
  if (error) throw new Error(`Database error: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((b) => b.id);
}

async function assertProductInTenant(productId: string, tenantId: string) {
  const { data: product } = await createSupabaseAdmin()
    .from('products')
    .select('id, business_id')
    .eq('id', productId)
    .maybeSingle();
  if (!product?.business_id) return null;
  const { data: business } = await createSupabaseAdmin()
    .from('businesses')
    .select('id')
    .eq('id', (product as Record<string, unknown>).business_id as string)
    .eq('organizer_id', tenantId)
    .maybeSingle();
  return business ? product : null;
}

export async function searchProducts(
  ctx: TenantToolContext,
  args: { query?: string; limit?: number } = {}
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'searchProducts', args);
  try {
    const limit = Math.min(args.limit ?? 10, 20);
    const businessIds = await tenantBusinessIds(tenantId);
    if (businessIds.length === 0) {
      logToolInvocation(ctx, null, 'searchProducts', args, 'allowed', 'success', 0);
      return [];
    }
    let query = createSupabaseAdmin()
      .from('products')
      .select(SAFE_PRODUCT_COLUMNS)
      .in('business_id', businessIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (args.query) query = query.ilike('name', `%${args.query}%`);
    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('searchProducts', (data ?? []) as object[], 'product');
    logToolInvocation(ctx, null, 'searchProducts', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    logToolInvocation(ctx, null, 'searchProducts', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getProduct(
  ctx: TenantToolContext,
  args: { id?: string; slug?: string } = {}
): Promise<unknown | null> {
  const tenantId = requireToolContext(ctx, 'getProduct', args);
  try {
    if (!args.id && !args.slug) {
      throw new Error('[getProduct] Either id or slug is required');
    }
    const businessIds = await tenantBusinessIds(tenantId);
    if (businessIds.length === 0) {
      logToolInvocation(ctx, null, 'getProduct', args, 'denied', 'error', 0, 'no tenant businesses');
      throw new Error('[getProduct] Product not found');
    }
    let query = createSupabaseAdmin()
      .from('products')
      .select(SAFE_PRODUCT_COLUMNS)
      .in('business_id', businessIds)
      .limit(1);
    if (args.id) query = query.eq('id', args.id);
    else query = query.eq('slug', args.slug);
    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('getProduct', (data ?? []) as object[], 'product');
    const row = rows[0] ?? null;
    if (!row) {
      logToolInvocation(ctx, null, 'getProduct', args, 'denied', 'error', 0, 'not found in tenant');
      throw new Error('[getProduct] Product not found');
    }
    logToolInvocation(ctx, null, 'getProduct', args, 'allowed', 'success', 1);
    return row;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getProduct] Product not found')) throw err;
    logToolInvocation(ctx, null, 'getProduct', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getProductAvailability(
  ctx: TenantToolContext,
  args: { productId: string }
): Promise<unknown> {
  const tenantId = requireToolContext(ctx, 'getProductAvailability', args);
  try {
    const product = await assertProductInTenant(args.productId, tenantId);
    if (!product) {
      logToolInvocation(ctx, null, 'getProductAvailability', args, 'denied', 'error', 0, 'not in tenant');
      throw new Error('[getProductAvailability] Product not found');
    }
    const { data, error } = await createSupabaseAdmin()
      .from('products')
      .select('id, stock_quantity, status')
      .eq('id', args.productId)
      .maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('getProductAvailability', data ? [data as object] : [], 'product');
    logToolInvocation(ctx, null, 'getProductAvailability', args, 'allowed', 'success', rows.length);
    return rows[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getProductAvailability] Product not found')) throw err;
    logToolInvocation(ctx, null, 'getProductAvailability', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getProductOrderStatus(
  ctx: TenantToolContext,
  args: { orderId: string }
): Promise<unknown> {
  const tenantId = requireToolContext(ctx, 'getProductOrderStatus', args);
  try {
    const { data: order, error } = await createSupabaseAdmin()
      .from('product_orders')
      .select(SAFE_PRODUCT_ORDER_COLUMNS)
      .eq('id', args.orderId)
      .maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    if (!order) {
      logToolInvocation(ctx, null, 'getProductOrderStatus', args, 'denied', 'error', 0, 'order not found');
      throw new Error('[getProductOrderStatus] Order not found');
    }
    const product = await assertProductInTenant(
      (order as Record<string, unknown>).product_id as string,
      tenantId
    );
    if (!product) {
      logToolInvocation(ctx, null, 'getProductOrderStatus', args, 'denied', 'error', 0, 'cross-tenant order');
      throw new Error('[getProductOrderStatus] Order not found');
    }
    const rows = screenToolResult('getProductOrderStatus', [order as object], 'product_order');
    logToolInvocation(ctx, null, 'getProductOrderStatus', args, 'allowed', 'success', 1);
    return rows[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getProductOrderStatus] Order not found')) throw err;
    logToolInvocation(ctx, null, 'getProductOrderStatus', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
