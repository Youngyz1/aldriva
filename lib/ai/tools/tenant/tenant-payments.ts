/**
 * lib/ai/tools/tenant/tenant-payments.ts
 *
 * getPaymentStatus — READ ONLY. Reads donations / ticket_orders /
 * product_orders .status directly. It MUST NOT write to any of these
 * columns and MUST NOT call record_donation_and_credit /
 * record_ticket_and_credit / record_product_paid_and_credit — those remain
 * exclusively invoked by the signed webhook handlers
 * (app/api/webhooks/stripe/route.ts, app/api/crypto/webhook/route.ts).
 * A repo grep for those RPC names must show zero hits in lib/ai/.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import {
  TenantToolContext,
  logToolInvocation,
  requireToolContext,
} from './tool-context';

export const getPaymentStatusDefinition: AIToolDefinition = {
  name: 'getPaymentStatus',
  description:
    'Reads the payment status of a donation, ticket order, or product order of the current tenant. READ-ONLY: never confirms, captures, or updates payment.',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description: 'One of: donation, ticket_order, product_order.',
      },
      id: { type: 'string', description: 'Row id (uuid).' },
    },
    required: ['kind', 'id'],
  },
  scope: 'tenant_scoped',
};

export type PaymentKind = 'donation' | 'ticket_order' | 'product_order';

async function belongsToTenant(
  kind: PaymentKind,
  id: string,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const admin = createSupabaseAdmin();
  if (kind === 'donation') {
    const { data: donation } = await admin
      .from('donations')
      .select('id, fundraiser_id, amount, currency, status, payment_method, created_at')
      .eq('id', id)
      .maybeSingle();
    if (!donation) return null;
    const { data: fundraiser } = await admin
      .from('fundraisers')
      .select('id')
      .eq('id', (donation as Record<string, unknown>).fundraiser_id as string)
      .eq('organizer_id', tenantId)
      .maybeSingle();
    return fundraiser ? (donation as Record<string, unknown>) : null;
  }
  if (kind === 'ticket_order') {
    const { data: order } = await admin
      .from('ticket_orders')
      .select('id, event_id, quantity, total_amount, status, payment_method, created_at')
      .eq('id', id)
      .maybeSingle();
    if (!order) return null;
    const { data: event } = await admin
      .from('events')
      .select('id')
      .eq('id', (order as Record<string, unknown>).event_id as string)
      .eq('organizer_id', tenantId)
      .maybeSingle();
    return event ? (order as Record<string, unknown>) : null;
  }
  const { data: order } = await admin
    .from('product_orders')
    .select('id, product_id, quantity, total_amount, currency, status, payment_method, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!order) return null;
  const { data: product } = await admin
    .from('products')
    .select('id, business_id')
    .eq('id', (order as Record<string, unknown>).product_id as string)
    .maybeSingle();
  const businessId = (product as Record<string, unknown> | null)?.business_id as string | null;
  if (!businessId) return null;
  const { data: business } = await admin
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('organizer_id', tenantId)
    .maybeSingle();
  return business ? (order as Record<string, unknown>) : null;
}

export async function getPaymentStatus(
  ctx: TenantToolContext,
  args: { kind: PaymentKind; id: string }
): Promise<unknown> {
  const tenantId = requireToolContext(ctx, 'getPaymentStatus', args);
  try {
    if (!['donation', 'ticket_order', 'product_order'].includes(args.kind)) {
      throw new Error('[getPaymentStatus] kind must be donation, ticket_order, or product_order');
    }
    const row = await belongsToTenant(args.kind, args.id, tenantId);
    if (!row) {
      logToolInvocation(ctx, null, 'getPaymentStatus', args, 'denied', 'error', 0, 'not found in tenant');
      throw new Error('[getPaymentStatus] Record not found');
    }
    const rows = screenToolResult('getPaymentStatus', [row as object], args.kind);
    logToolInvocation(ctx, null, 'getPaymentStatus', args, 'allowed', 'success', 1);
    return rows[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getPaymentStatus] Record not found')) throw err;
    logToolInvocation(ctx, null, 'getPaymentStatus', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
