/**
 * lib/promotionEngine.js
 *
 * The Promotion Engine is a pure service module responsible for selecting
 * the next piece of content to promote across any marketing channel.
 *
 * Refactored in Phase 4:
 *  - Added businessProvider, articleProvider, and productProvider to PROVIDER_REGISTRY.
 *  - Uses safe-column allowlist SELECTs matching Phase 2 tools (no select('*')).
 *  - Implements 7-day deduplication check querying ai_content_items.source_id.
 */

import { createClient } from '@supabase/supabase-js';
import { BRAND } from '../config/branding';

const CANDIDATE_POOL_SIZE = 20;
const DEFAULT_DEDUP_DAYS = 7;

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

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured && !configured.includes('localhost')) {
    return configured.replace(/\/$/, '');
  }
  return (BRAND?.website || 'https://aldriva.com').replace(/\/$/, '');
}

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Event Provider ─────────────────────────────────────────────────────────
const eventProvider = {
  type: 'event',

  async fetchCandidates(supabase) {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('events')
      .select('id, title, slug, description, banner, event_date, venue, city, category')
      .eq('status', 'approved')
      .eq('visibility', 'public')
      .gte('event_date', now)
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
      description: row.description
        ? row.description.slice(0, 200).trimEnd()
        : [row.city, row.venue].filter(Boolean).join(' · '),
      image: row.banner ?? null,
      url: `${baseUrl}/events/${row.slug}`,

      cta: {
        label: 'Buy Tickets',
        requiresPayment: true,
      },

      metadata: {
        event_date: row.event_date ?? null,
        venue: row.venue ?? null,
        city: row.city ?? null,
        category: row.category ?? null,
      },
    };
  },
};

// ── 2. Fundraiser Provider ────────────────────────────────────────────────────
const fundraiserProvider = {
  type: 'fundraiser',

  async fetchCandidates(supabase) {
    const { data, error } = await supabase
      .from('fundraisers')
      .select('id, title, slug, story, banner, goal, raised, category')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_POOL_SIZE * 2);

    if (error) {
      console.error('[PromotionEngine][fundraiserProvider] DB error:', error.message);
      return [];
    }

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
        : `Help us reach our goal. ${progress}% funded so far.`,
      image: row.banner ?? null,
      url: `${baseUrl}/fundraisers/${row.slug}`,

      cta: {
        label: 'Donate Now',
        requiresPayment: true,
      },

      metadata: {
        goal,
        raised,
        progress,
        category: row.category ?? null,
      },
    };
  },
};

// ── 3. Business Provider ──────────────────────────────────────────────────────
const businessProvider = {
  type: 'business',

  async fetchCandidates(supabase) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, slug, description, logo, category, city, website')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      console.error('[PromotionEngine][businessProvider] DB error:', error.message);
      return [];
    }

    return data ?? [];
  },

  mapToPromotion(row, baseUrl) {
    return {
      id: row.id,
      type: 'business',
      title: row.name,
      description: row.description
        ? row.description.slice(0, 200).trimEnd()
        : `Featured business in ${row.city || 'our community'}.`,
      image: row.logo ?? null,
      url: row.slug ? `${baseUrl}/businesses/${row.slug}` : (row.website || `${baseUrl}/businesses`),

      cta: {
        label: 'Explore Business',
        requiresPayment: false,
      },

      metadata: {
        category: row.category ?? null,
        city: row.city ?? null,
        website: row.website ?? null,
      },
    };
  },
};

// ── 4. Article Provider ───────────────────────────────────────────────────────
const articleProvider = {
  type: 'article',

  async fetchCandidates(supabase) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, title, slug, excerpt, cover_image, categories, published_at, reading_time')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      console.error('[PromotionEngine][articleProvider] DB error:', error.message);
      return [];
    }

    return data ?? [];
  },

  mapToPromotion(row, baseUrl) {
    return {
      id: row.id,
      type: 'article',
      title: row.title,
      description: row.excerpt
        ? row.excerpt.slice(0, 200).trimEnd()
        : 'Read the latest story on Aldriva.',
      image: row.cover_image ?? null,
      url: `${baseUrl}/articles/${row.slug}`,

      cta: {
        label: 'Read Article',
        requiresPayment: false,
      },

      metadata: {
        categories: row.categories ?? [],
        published_at: row.published_at ?? null,
        reading_time: row.reading_time ?? null,
      },
    };
  },
};

// ── 5. Product Provider ───────────────────────────────────────────────────────
const productProvider = {
  type: 'product',

  async fetchCandidates(supabase) {
    // Real products columns (migration_37 + 38): there is no title /
    // cover_image / price / category / product_type column. Price lives on
    // Stripe / product_orders snapshots, images is a TEXT[].
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, description, images, price_type')
      .in('status', ['active', 'out_of_stock'])
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      console.error('[PromotionEngine][productProvider] DB error:', error.message);
      return [];
    }

    return data ?? [];
  },

  mapToPromotion(row, baseUrl) {
    const images = Array.isArray(row.images) ? row.images : [];
    return {
      id: row.id,
      type: 'product',
      title: row.name,
      description: row.description
        ? row.description.slice(0, 200).trimEnd()
        : 'Discover digital products on Aldriva.',
      image: images[0] ?? null,
      url: `${baseUrl}/products/${row.slug}`,

      cta: {
        label: 'Get Digital Product',
        requiresPayment: true,
      },

      metadata: {
        price: null,
        category: null,
        product_type: row.price_type ?? null,
      },
    };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

const PROVIDER_REGISTRY = [
  eventProvider,
  fundraiserProvider,
  businessProvider,
  articleProvider,
  productProvider,
];

// ══════════════════════════════════════════════════════════════════════════════
// DEDUPLICATION HELPER (ai_content_items)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches the set of source_ids that have been promoted or logged in ai_content_items
 * within the last dedupDays window (default 7 days).
 */
export async function getRecentlyPromotedIds(supabase, dedupDays = DEFAULT_DEDUP_DAYS) {
  const since = new Date(Date.now() - dedupDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('ai_content_items')
    .select('source_id')
    .gte('created_at', since);

  if (error) {
    console.warn('[PromotionEngine] Failed to fetch recent promotions for dedup:', error.message);
    return new Set();
  }

  const ids = new Set((data || []).map((item) => item.source_id).filter(Boolean));
  return ids;
}

function pickRandom(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getNextPromotion(options)
 *
 * Selects the next piece of content to promote across events, fundraisers,
 * businesses, articles, and products.
 * Excludes candidates that were promoted in the last dedupDays window (default 7).
 *
 * @param {object} [options]
 * @param {number} [options.dedupDays=7] - Deduplication window in days
 * @returns {Promise<PromotionObject|null>}
 */
export async function getNextPromotion(options = {}) {
  const supabase = getSupabaseAdmin();
  const baseUrl = getBaseUrl();
  const dedupDays = options.dedupDays ?? DEFAULT_DEDUP_DAYS;

  // Step 1 — Parallel candidate fetch across all 5 providers
  const candidatesByProvider = await Promise.all(
    PROVIDER_REGISTRY.map(async (provider) => {
      const rows = await provider.fetchCandidates(supabase);
      return rows.map((row) => provider.mapToPromotion(row, baseUrl));
    })
  );

  // Step 2 — Merge candidates into unified pool
  const rawPool = candidatesByProvider.flat();

  if (rawPool.length === 0) {
    console.warn('[PromotionEngine] No eligible content found across all providers.');
    return null;
  }

  // Step 3 — Deduplication filter against ai_content_items
  const recentlyPromotedIds = await getRecentlyPromotedIds(supabase, dedupDays);
  let pool = rawPool.filter((promo) => !recentlyPromotedIds.has(promo.id));

  // Fall back to raw pool if all candidates were recently promoted
  if (pool.length === 0) {
    console.warn(
      `[PromotionEngine] All ${rawPool.length} candidates were promoted in the last ${dedupDays} days. Falling back to full pool.`
    );
    pool = rawPool;
  }

  // Step 4 — Select candidate from deduplicated pool
  const promotion = pickRandom(pool);

  console.log(
    `[PromotionEngine] Selected: type=${promotion.type} id=${promotion.id} title="${promotion.title}" (pool: ${pool.length}/${rawPool.length}, dedup window: ${dedupDays}d)`
  );

  return promotion;
}
