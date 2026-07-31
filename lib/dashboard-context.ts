/**
 * lib/dashboard-context.ts
 * Uses React's per-request cache() so getCurrentUser() and the organizer
 * lookup run ONCE per request, no matter how many layout/page server
 * components call this function.
 *
 * Without this: layout + every sub-page each independently hit Supabase
 * for auth + organizer → 2 extra round-trips per page load.
 * With this: those calls are deduped to a single round-trip per request.
 */

import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/auth';

// Module-level client — instantiated once at cold-start, not per-request
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type DashboardContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  organizers: { id: string; name: string; bio?: string | null; photo?: string | null; slug?: string | null; org_type?: string | null; status?: string | null }[];
  organizer: { id: string; name: string; bio?: string | null; photo?: string | null; slug?: string | null; org_type?: string | null; status?: string | null } | null;
  organizerIds: string[];
  organizerId: string | null;
};

/**
 * Returns the current user and all organizer profiles owned by them.
 * Cached per-request by React — safe to call from both layout and page
 * without duplicating DB queries.
 */
export const getDashboardContext = cache(async (): Promise<DashboardContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.deleted_at) return null;

  const { data: organizers } = await supabaseAdmin
    .from('organizers')
    .select('id, name, bio, photo, slug, org_type, status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const safeOrganizers = organizers ?? [];
  const primaryOrganizer = safeOrganizers[0] ?? null;

  return {
    user,
    organizers: safeOrganizers,
    organizer: primaryOrganizer,
    organizerIds: safeOrganizers.map((organizer) => organizer.id),
    organizerId: primaryOrganizer?.id ?? null,
  };
});

// Re-export supabaseAdmin so pages can import it from one place
export { supabaseAdmin };
