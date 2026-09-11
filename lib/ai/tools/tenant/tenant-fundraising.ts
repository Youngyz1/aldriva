/**
 * lib/ai/tools/tenant/tenant-fundraising.ts
 *
 * Tenant-scoped fundraising tools, pinned to fundraisers.organizer_id =
 * tenantId. Results pass through screenToolResult() exactly like the 9
 * pre-existing tools. Read-only.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import {
  TenantToolContext,
  logToolInvocation,
  requireToolContext,
} from './tool-context';

// Both raised (live writer: recalculateFundraiserRaised) and raised_amount
// (legacy migration_14 trigger) exist on fundraisers; select both so the
// model never reads a stale single source.
const SAFE_FUNDRAISER_COLUMNS =
  'id, title, slug, story, banner, goal, raised, raised_amount, status, category' as const;

const SAFE_DONATION_COLUMNS =
  'id, fundraiser_id, amount, currency, status, payment_method, created_at' as const;

export const searchFundraisersDefinition: AIToolDefinition = {
  name: 'searchFundraisers',
  description: 'Searches fundraisers belonging to the current organizer tenant.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional text search on fundraiser titles.' },
      category: { type: 'string', description: 'Optional category filter.' },
      limit: { type: 'number', description: 'Max results (default 10, max 20).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export const getFundraiserDefinition: AIToolDefinition = {
  name: 'getFundraiser',
  description: 'Gets one fundraiser of the current organizer tenant by id or slug. Fails closed for other tenants\' fundraisers.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Fundraiser id (uuid).' },
      slug: { type: 'string', description: 'Fundraiser slug.' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export const getDonationStatusDefinition: AIToolDefinition = {
  name: 'getDonationStatus',
  description: 'Reads the status of one donation to the current tenant\'s fundraiser. Read-only; never confirms payment.',
  parameters: {
    type: 'object',
    properties: {
      donationId: { type: 'string', description: 'Donation id (uuid).' },
    },
    required: ['donationId'],
  },
  scope: 'tenant_scoped',
};

export async function searchFundraisers(
  ctx: TenantToolContext,
  args: { query?: string; category?: string; limit?: number } = {}
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'searchFundraisers', args);
  try {
    const limit = Math.min(args.limit ?? 10, 20);
    let query = createSupabaseAdmin()
      .from('fundraisers')
      .select(SAFE_FUNDRAISER_COLUMNS)
      .eq('organizer_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (args.query) query = query.ilike('title', `%${args.query}%`);
    if (args.category) query = query.eq('category', args.category);
    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('searchFundraisers', (data ?? []) as object[], 'fundraiser');
    logToolInvocation(ctx, null, 'searchFundraisers', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    logToolInvocation(ctx, null, 'searchFundraisers', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getFundraiser(
  ctx: TenantToolContext,
  args: { id?: string; slug?: string } = {}
): Promise<unknown | null> {
  const tenantId = requireToolContext(ctx, 'getFundraiser', args);
  try {
    if (!args.id && !args.slug) {
      throw new Error('[getFundraiser] Either id or slug is required');
    }
    let query = createSupabaseAdmin()
      .from('fundraisers')
      .select(SAFE_FUNDRAISER_COLUMNS)
      .eq('organizer_id', tenantId)
      .limit(1);
    if (args.id) query = query.eq('id', args.id);
    else query = query.eq('slug', args.slug);
    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('getFundraiser', (data ?? []) as object[], 'fundraiser');
    const row = rows[0] ?? null;
    if (!row) {
      logToolInvocation(ctx, null, 'getFundraiser', args, 'denied', 'error', 0, 'not found in tenant');
      throw new Error('[getFundraiser] Fundraiser not found');
    }
    logToolInvocation(ctx, null, 'getFundraiser', args, 'allowed', 'success', 1);
    return row;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getFundraiser] Fundraiser not found')) throw err;
    logToolInvocation(ctx, null, 'getFundraiser', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getDonationStatus(
  ctx: TenantToolContext,
  args: { donationId: string }
): Promise<unknown> {
  const tenantId = requireToolContext(ctx, 'getDonationStatus', args);
  try {
    const { data: donation, error } = await createSupabaseAdmin()
      .from('donations')
      .select(SAFE_DONATION_COLUMNS)
      .eq('id', args.donationId)
      .maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    if (!donation) {
      logToolInvocation(ctx, null, 'getDonationStatus', args, 'denied', 'error', 0, 'donation not found');
      throw new Error('[getDonationStatus] Donation not found');
    }
    // Verify the donation's fundraiser belongs to this tenant (fail closed).
    const { data: fundraiser } = await createSupabaseAdmin()
      .from('fundraisers')
      .select('id')
      .eq('id', (donation as Record<string, unknown>).fundraiser_id as string)
      .eq('organizer_id', tenantId)
      .maybeSingle();
    if (!fundraiser) {
      logToolInvocation(ctx, null, 'getDonationStatus', args, 'denied', 'error', 0, 'cross-tenant donation');
      throw new Error('[getDonationStatus] Donation not found');
    }
    const rows = screenToolResult('getDonationStatus', [donation as object], 'donation');
    logToolInvocation(ctx, null, 'getDonationStatus', args, 'allowed', 'success', 1);
    return rows[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getDonationStatus] Donation not found')) throw err;
    logToolInvocation(ctx, null, 'getDonationStatus', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
