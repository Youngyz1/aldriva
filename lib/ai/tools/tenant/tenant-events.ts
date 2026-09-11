/**
 * lib/ai/tools/tenant/tenant-events.ts
 *
 * Tenant-scoped event tools. Every query is pinned to the server-derived
 * tenantId (events.organizer_id = tenantId) — the model never supplies it.
 * Results pass through screenToolResult() exactly like the 9 pre-existing
 * tools. Read-only: no writes anywhere in this file.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import {
  TenantToolContext,
  logToolInvocation,
  requireToolContext,
} from './tool-context';

// Allowlisted columns only — never select('*'). Excludes internal/owner
// columns and anything added by future migrations unless added here.
const SAFE_EVENT_COLUMNS =
  'id, title, slug, description, banner, event_date, venue, city, category, status, visibility' as const;

export const searchEventsDefinition: AIToolDefinition = {
  name: 'searchEvents',
  description:
    'Searches events belonging to the current organizer tenant. Use to answer questions about this organizer\'s events.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional text search on event titles.' },
      city: { type: 'string', description: 'Optional city filter.' },
      category: { type: 'string', description: 'Optional category filter.' },
      limit: { type: 'number', description: 'Max results (default 10, max 20).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export const getEventDefinition: AIToolDefinition = {
  name: 'getEvent',
  description: 'Gets one event of the current organizer tenant by id or slug. Fails closed for other tenants\' events.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Event id (uuid).' },
      slug: { type: 'string', description: 'Event slug.' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export const getTicketAvailabilityDefinition: AIToolDefinition = {
  name: 'getTicketAvailability',
  description: 'Reads ticket tiers (name, price, quantity) for one of the current tenant\'s events. Read-only.',
  parameters: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Event id (uuid) within the current tenant.' },
    },
    required: ['eventId'],
  },
  scope: 'tenant_scoped',
};

export const getTicketOrderStatusDefinition: AIToolDefinition = {
  name: 'getTicketOrderStatus',
  description: 'Reads the status of one ticket order of the current tenant\'s event. Read-only; never confirms payment.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Ticket order id (uuid).' },
    },
    required: ['orderId'],
  },
  scope: 'tenant_scoped',
};

const SAFE_TICKET_COLUMNS = 'id, name, price, quantity' as const;
const SAFE_ORDER_COLUMNS =
  'id, event_id, quantity, total_amount, status, payment_method, created_at' as const;

function serviceClient() {
  return createSupabaseAdmin();
}

export async function searchEvents(
  ctx: TenantToolContext,
  args: { query?: string; city?: string; category?: string; limit?: number } = {}
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'searchEvents', args);
  try {
    const limit = Math.min(args.limit ?? 10, 20);
    let query = serviceClient()
      .from('events')
      .select(SAFE_EVENT_COLUMNS)
      .eq('organizer_id', tenantId)
      .order('event_date', { ascending: true })
      .limit(limit);
    if (args.query) query = query.ilike('title', `%${args.query}%`);
    if (args.city) query = query.ilike('city', `%${args.city}%`);
    if (args.category) query = query.eq('category', args.category);
    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('searchEvents', (data ?? []) as object[], 'event');
    logToolInvocation(ctx, null, 'searchEvents', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    logToolInvocation(ctx, null, 'searchEvents', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getEvent(
  ctx: TenantToolContext,
  args: { id?: string; slug?: string } = {}
): Promise<unknown | null> {
  const tenantId = requireToolContext(ctx, 'getEvent', args);
  try {
    if (!args.id && !args.slug) {
      throw new Error('[getEvent] Either id or slug is required');
    }
    let query = serviceClient()
      .from('events')
      .select(SAFE_EVENT_COLUMNS)
      .eq('organizer_id', tenantId)
      .limit(1);
    if (args.id) query = query.eq('id', args.id);
    else query = query.eq('slug', args.slug);
    const { data, error } = await query;
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('getEvent', (data ?? []) as object[], 'event');
    const row = rows[0] ?? null;
    // Fail closed: no row for this tenant (missing or cross-tenant) is a
    // denial, not an empty success — logged distinctly, reported
    // identically (no existence oracle: missing vs cross-tenant share one
    // message).
    if (!row) {
      logToolInvocation(ctx, null, 'getEvent', args, 'denied', 'error', 0, 'not found in tenant');
      throw new Error('[getEvent] Event not found');
    }
    logToolInvocation(ctx, null, 'getEvent', args, 'allowed', 'success', 1);
    return row;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getEvent] Event not found')) throw err;
    logToolInvocation(ctx, null, 'getEvent', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getTicketAvailability(
  ctx: TenantToolContext,
  args: { eventId: string }
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'getTicketAvailability', args);
  try {
    // Verify the event belongs to this tenant first (fail closed).
    const { data: event } = await serviceClient()
      .from('events')
      .select('id')
      .eq('id', args.eventId)
      .eq('organizer_id', tenantId)
      .maybeSingle();
    if (!event) {
      logToolInvocation(ctx, null, 'getTicketAvailability', args, 'denied', 'error', 0, 'event not in tenant');
      throw new Error('[getTicketAvailability] Event not found');
    }
    const { data, error } = await serviceClient()
      .from('tickets')
      .select(SAFE_TICKET_COLUMNS)
      .eq('event_id', args.eventId);
    if (error) throw new Error(`Database error: ${error.message}`);
    const rows = screenToolResult('getTicketAvailability', (data ?? []) as object[], 'ticket');
    logToolInvocation(ctx, null, 'getTicketAvailability', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getTicketAvailability] Event not found')) throw err;
    logToolInvocation(ctx, null, 'getTicketAvailability', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function getTicketOrderStatus(
  ctx: TenantToolContext,
  args: { orderId: string }
): Promise<unknown> {
  const tenantId = requireToolContext(ctx, 'getTicketOrderStatus', args);
  try {
    const { data: order, error } = await serviceClient()
      .from('ticket_orders')
      .select(SAFE_ORDER_COLUMNS)
      .eq('id', args.orderId)
      .maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    if (!order) {
      logToolInvocation(ctx, null, 'getTicketOrderStatus', args, 'denied', 'error', 0, 'order not found');
      throw new Error('[getTicketOrderStatus] Order not found');
    }
    // Verify the order's event belongs to this tenant (fail closed).
    const { data: event } = await serviceClient()
      .from('events')
      .select('id')
      .eq('id', (order as Record<string, unknown>).event_id as string)
      .eq('organizer_id', tenantId)
      .maybeSingle();
    if (!event) {
      logToolInvocation(ctx, null, 'getTicketOrderStatus', args, 'denied', 'error', 0, 'cross-tenant order');
      throw new Error('[getTicketOrderStatus] Order not found');
    }
    const rows = screenToolResult('getTicketOrderStatus', [order as object], 'ticket_order');
    logToolInvocation(ctx, null, 'getTicketOrderStatus', args, 'allowed', 'success', 1);
    return rows[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes('[getTicketOrderStatus] Order not found')) throw err;
    logToolInvocation(ctx, null, 'getTicketOrderStatus', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
