/**
 * lib/promotionEngine.js
 *
 * The Promotion Engine is a pure service module responsible for selecting
 * the next piece of content to promote across any marketing channel.
 *
 * It does NOT know about:
 *   - Facebook, Instagram, LinkedIn, or any social platform
 *   - Gemini or any AI model
 *   - Cron jobs or scheduling
 *   - HTTP requests or responses
 *   - Vercel or any deployment platform
 *
 * Architecture
 * ─────────────
 * The engine uses a provider registry pattern.
 *
 * Each "provider" is a module that knows how to:
 *   1. Fetch eligible content of a specific type from the database
 *   2. Map that content to the standard PromotionObject shape
 *
 * The engine itself is content-agnostic — it delegates everything to
 * providers and picks one result. Adding a new content type (e.g.
 * Business, Blog, Volunteer) only requires adding a new provider.
 * The public API never changes.
 *
 * ┌─────────────────────────────────┐
 * │        getNextPromotion()        │  ← single public entry point
 * └──────────────┬──────────────────┘
 *                │ selects a provider at random
 *       ┌────────┴────────┐
 *       ▼                 ▼
 * [EventProvider]  [FundraiserProvider]   ← v1 providers
 *       │                 │
 *       ▼                 ▼
 *  Supabase query    Supabase query
 *       │                 │
 *       ▼                 ▼
 *  PromotionObject   PromotionObject      ← always identical shape
 *
 * Standard PromotionObject
 * ─────────────────────────
 * {
 *   id:          string   — database UUID
 *   type:        string   — 'event' | 'fundraiser' | 'business' | ...
 *   title:       string
 *   description: string   — short excerpt suitable for a social caption
 *   image:       string | null  — absolute URL or null
 *   url:         string   — absolute public URL to the listing page
 *
 *   cta: {
 *     label:           string   — e.g. 'Buy Tickets', 'Donate Now'
 *     requiresPayment: boolean
 *   }
 *
 *   metadata: object  — type-specific fields (date, city, goal, raised, …)
 *                       not used by the engine but available to consumers
 * }
 */

import { createClient } from '@supabase/supabase-js';

// ── Supabase admin client ──────────────────────────────────────────────────────
// Uses the service role key so RLS does not filter out records.
// We create a module-level instance so the engine can be called from any
// context (cron route, API route, server component) without needing an
// existing client to be passed in.

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[PromotionEngine] Supabase service role is not configured. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient(url, key);
}

// ── Base URL helper ────────────────────────────────────────────────────────────
// Reads NEXT_PUBLIC_BASE_URL which is already set in .env.local.
// Consumers (Facebook, email, etc.) receive absolute URLs in the object.

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.fund4agoodcause.com').replace(/\/$/, '');
}

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDERS
// Each provider exports two things:
//   fetchCandidates(supabase)  → array of raw DB rows (may be empty)
//   mapToPromotion(row)        → PromotionObject
//
// Providers are intentionally kept as plain objects inside this file for v1.
// They can be split into separate files (lib/providers/events.js, etc.) later
// without any public API change.
// ══════════════════════════════════════════════════════════════════════════════

// ── Event Provider ─────────────────────────────────────────────────────────────
/**
 * Fetches upcoming, public, approved events.
 * Returns up to CANDIDATE_POOL_SIZE records so the engine can pick one at random.
 */
const CANDIDATE_POOL_SIZE = 20;

const eventProvider = {
  type: 'event',

  async fetchCandidates(supabase) {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('events')
      .select('id, title, slug, description, banner, event_date, venue, city, category')
      .eq('status', 'approved')
      .eq('visibility', 'public')
      .gte('event_date', now)            // future events only
      .order('event_date', { ascending: true })
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      console.error('[PromotionEngine][eventProvider] DB error:', error.message);
      return [];
    }

    return data ?? [];
  },

  mapToPromotion(row, baseUrl) {
    return {
      id: row.id,
      type: 'event',
      title: row.title,
      // Use description if available; fall back to a location-based excerpt.
      description:
        row.description
          ? row.description.slice(0, 200).trimEnd()
          : [row.city, row.venue].filter(Boolean).join(' · '),
      image: row.banner ?? null,
      url: `${baseUrl}/events/${row.slug}`,

      cta: {
        label: 'Buy Tickets',
        requiresPayment: true,
      },

      // metadata carries type-specific fields for consumers that want them
      // (e.g. a caption generator that wants to mention the date and city).
      metadata: {
        event_date: row.event_date ?? null,
        venue: row.venue ?? null,
        city: row.city ?? null,
        category: row.category ?? null,
      },
    };
  },
};

// ── Fundraiser Provider ────────────────────────────────────────────────────────
/**
 * Fetches active fundraisers — campaigns where raised < goal
 * (still collecting donations). We do not filter by status column because
 * fundraisers do not have a discrete "approved/rejected" field — they are
 * controlled by whether they have a valid organizer and are publicly visible.
 */
const fundraiserProvider = {
  type: 'fundraiser',

  async fetchCandidates(supabase) {
    // Supabase JS v2 does not support column-to-column comparisons
    // (e.g. raised < goal) in a single query without a custom RPC.
    // We fetch the most recent candidates and apply the active-campaign
    // filter client-side. CANDIDATE_POOL_SIZE caps the data transferred.
    const { data, error } = await supabase
      .from('fundraisers')
      .select('id, title, slug, story, banner, goal, raised, category')
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      console.error('[PromotionEngine][fundraiserProvider] DB error:', error.message);
      return [];
    }

    // Keep only campaigns that still have room to grow (raised < goal).
    return (data ?? []).filter((row) => {
      const goal = Number(row.goal ?? 0);
      const raised = Number(row.raised ?? 0);
      return goal > 0 && raised < goal;
    });
  },

  mapToPromotion(row, baseUrl) {
    const goal = Number(row.goal ?? 0);
    const raised = Number(row.raised ?? 0);
    const progress = goal > 0 ? Math.round((raised / goal) * 100) : 0;

    return {
      id: row.id,
      type: 'fundraiser',
      title: row.title,
      description: row.story
        ? row.story.slice(0, 200).trimEnd()
        : `Help us reach our $${goal.toLocaleString()} goal. ${progress}% funded so far.`,
      image: row.banner ?? null,
      url: `${baseUrl}/fundraisers/${row.slug}`,

      cta: {
        label: 'Donate Now',
        requiresPayment: true,
      },

      metadata: {
        goal,
        raised,
        progress,         // 0–100 integer percentage
        category: row.category ?? null,
      },
    };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER REGISTRY
//
// To add a new content type, create a provider object following the same
// interface as eventProvider / fundraiserProvider, then add it here.
//
// Example future providers (not yet implemented):
//   businessProvider, volunteerProvider, blogProvider, productProvider
//
// The engine code below does not need to change when new providers are added.
// ══════════════════════════════════════════════════════════════════════════════

const PROVIDER_REGISTRY = [
  eventProvider,
  fundraiserProvider,

  // Future providers — uncomment when implemented:
  // businessProvider,
  // volunteerProvider,
  // blogProvider,
  // productProvider,
  // testimonialProvider,
  // announcementProvider,
];

// ══════════════════════════════════════════════════════════════════════════════
// SELECTION STRATEGY
//
// v1 uses a two-level random selection:
//   1. Pick a random provider from the registry (equal weight per type).
//   2. Pick a random candidate from that provider's result set.
//
// This gives fair rotation across content types regardless of how many items
// each type has. The strategy can be replaced with a weighted or deterministic
// one (e.g. round-robin with last_promoted_at) without changing the public API.
// ══════════════════════════════════════════════════════════════════════════════

function pickRandom(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getNextPromotion()
 *
 * Selects the next piece of content to promote and returns a standardized
 * PromotionObject. Returns null if no eligible content is found.
 *
 * Flow:
 *   1. Every provider in the registry fetches its eligible candidates.
 *   2. All candidates are mapped to PromotionObjects and merged into one pool.
 *   3. The best candidate is selected from that unified pool.
 *   4. The selected PromotionObject is returned.
 *
 * @returns {Promise<PromotionObject|null>}
 *
 * Usage:
 *   import { getNextPromotion } from '@/lib/promotionEngine.js';
 *   const promo = await getNextPromotion();
 *   if (!promo) { // handle empty state }
 */
export async function getNextPromotion() {
  const supabase = getSupabaseAdmin();
  const baseUrl = getBaseUrl();

  // Step 1 — Every provider fetches its eligible candidates in parallel.
  const candidatesByProvider = await Promise.all(
    PROVIDER_REGISTRY.map(async (provider) => {
      const rows = await provider.fetchCandidates(supabase);
      return rows.map((row) => provider.mapToPromotion(row, baseUrl));
    })
  );

  // Step 2 — Merge all PromotionObjects into a single flat pool.
  const pool = candidatesByProvider.flat();

  if (pool.length === 0) {
    console.warn('[PromotionEngine] No eligible content found across all providers.');
    return null;
  }

  // Step 3 — Select the best candidate from the unified pool.
  // v1 uses random selection; replace selectBest() with a scoring or
  // round-robin function later without changing anything above this line.
  const promotion = selectBest(pool);

  console.log(
    `[PromotionEngine] Selected: type=${promotion.type} id=${promotion.id} title="${promotion.title}" (pool size: ${pool.length})`
  );

  return promotion;
}

// ── Selection strategy ────────────────────────────────────────────────────────
// Isolated so the algorithm can be upgraded (e.g. weighted scoring,
// last_promoted_at round-robin) without touching the engine logic above.

function selectBest(pool) {
  return pickRandom(pool);
}
