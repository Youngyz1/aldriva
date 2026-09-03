/**
 * lib/ai/tools/get_upcoming_events.ts
 *
 * Safe-column allowlist tool: returns only the explicitly listed columns
 * for upcoming, approved, public events. The model is structurally incapable
 * of receiving any column not named in the .select() call below — this is a
 * database constraint, not a prompt instruction.
 *
 * Safe columns (matches promotionEngine eventProvider + Phase 0.5 report):
 *   id, title, slug, description, banner, event_date, venue, city, category
 *
 * Excluded (never sent to model):
 *   organizer_id, created_by, ticket_price, capacity, stripe_account_id,
 *   internal_notes, and any column added to the events table in future
 *   migrations that isn't explicitly added here.
 */

import { createClient } from '@supabase/supabase-js';
import { AIToolDefinition } from '../types';
import { screenToolResult } from '../output-guard';

// ── Allowlisted columns ───────────────────────────────────────────────────────
const SAFE_COLUMNS =
  'id, title, slug, description, banner, event_date, venue, city, category' as const;

// ── Tool definition (for AIProvider.toolCall) ─────────────────────────────────
export const getUpcomingEventsDefinition: AIToolDefinition = {
  name: 'get_upcoming_events',
  description:
    'Retrieves a list of upcoming approved public events on the Aldriva platform. ' +
    'Use this to find events to promote, generate captions for, or reference in content.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of events to return (default 10, max 20).',
      },
      city: {
        type: 'string',
        description: 'Optional city filter to narrow results to a specific location.',
      },
      category: {
        type: 'string',
        description: 'Optional category filter (e.g. "music", "charity", "sports").',
      },
    },
    required: [],
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────
export interface GetUpcomingEventsArgs {
  limit?: number;
  city?: string;
  category?: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  banner: string | null;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  category: string | null;
}

export async function getUpcomingEvents(
  args: GetUpcomingEventsArgs = {}
): Promise<UpcomingEvent[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const limit = Math.min(args.limit ?? 10, 20);
  const now = new Date().toISOString();

  // ── Hard-coded allowlist SELECT — no select('*') ──────────────────────────
  // [V3 HOOK] Per-user isolation: add .eq('status', 'approved').eq('created_by', requestingUserId)
  // here when V3 introduces end-users who can only see their own submitted events.
  let query = supabase
    .from('events')
    .select(SAFE_COLUMNS)
    .eq('status', 'approved')
    .eq('visibility', 'public')
    .gte('event_date', now)
    .order('event_date', { ascending: true })
    .limit(limit);

  if (args.city) {
    query = query.ilike('city', `%${args.city}%`);
  }

  if (args.category) {
    query = query.eq('category', args.category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[get_upcoming_events] Database error: ${error.message}`);
  }

  const rows = (data ?? []) as UpcomingEvent[];

  // Pass every row through the output guard before returning to any caller.
  return screenToolResult('get_upcoming_events', rows, 'event');
}
