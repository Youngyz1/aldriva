import { cache } from "react";

import { normalizeImageUrl } from "@/lib/image-url";
import { supabase } from "@/lib/supabase";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const FUNDRAISER_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1600&auto=format&fit=crop";

type OptionalFundraiserFields = {
  description?: string | null;
  goal_amount?: number | string | null;
  short_description?: string | null;
  beneficiary?: string | null;
  beneficiary_name?: string | null;
};

const OPTIONAL_FUNDRAISER_FIELDS = [
  "description",
  "goal_amount",
  "short_description",
  "beneficiary",
  "beneficiary_name",
] as const;

/** Deduplicated cache helper for querying fundraiser details. */
export const getFundraiserBySlug = cache(async (slug: string) => {
  const { data: fundraiser } = await supabase
    .from("fundraisers")
    .select(
      "id, title, slug, banner, image_url, goal, raised, raised_amount, organizer_id, organizer, story, category, created_at, review_count, average_rating"
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return fundraiser;
});

export const getOptionalFundraiserFields = cache(async (fundraiserId: string) => {
  const { data, error } = await supabase
    .from("fundraisers")
    .select(OPTIONAL_FUNDRAISER_FIELDS.join(", "))
    .eq("id", fundraiserId)
    .maybeSingle();

  if (error || !data) {
    return Object.fromEntries(
      OPTIONAL_FUNDRAISER_FIELDS.map((f) => [f, null])
    ) as OptionalFundraiserFields;
  }
  return data as unknown as OptionalFundraiserFields;
});

/**
 * Lightweight summary used for generated share/OG imagery — just the display
 * strings and numbers, not the profile IDs `page.tsx` resolves separately for
 * linking the organizer/beneficiary.
 */
export async function getFundraiserCardData(slug: string) {
  const fundraiser = await getFundraiserBySlug(slug);
  if (!fundraiser) return null;

  const optionalFundraiser = await getOptionalFundraiserFields(fundraiser.id);

  const { data: organizer } = fundraiser.organizer_id
    ? await supabase
        .from("organizers")
        .select("id, name")
        .eq("id", fundraiser.organizer_id)
        .maybeSingle()
    : { data: null };

  const organizerName =
    organizer?.name || fundraiser.organizer || "Campaign organizer";

  const beneficiaryName: string =
    optionalFundraiser.beneficiary ||
    optionalFundraiser.beneficiary_name ||
    fundraiser.title ||
    "This Cause";

  const coverImage = normalizeImageUrl(
    fundraiser.image_url || fundraiser.banner,
    FUNDRAISER_FALLBACK_IMAGE
  );

  const raised = Number(fundraiser.raised ?? 0);
  const goal = Number(optionalFundraiser.goal_amount ?? fundraiser.goal ?? 0);
  const percentage =
    goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;

  return {
    title: fundraiser.title as string,
    organizerName,
    beneficiaryName,
    coverImage,
    raised,
    goal,
    percentage,
  };
}

export type FundraiserCardData = NonNullable<
  Awaited<ReturnType<typeof getFundraiserCardData>>
>;

export type RelatedFundraiser = {
  id: string;
  title: string;
  slug: string;
  banner: string | null;
  image_url: string | null;
  organizer: string | null;
  goal: number | string | null;
  raised: number | string | null;
  raised_amount: number | string | null;
};

export type RelatedFundraiserCategory =
  | "worldwide"
  | "close-to-target"
  | "just-launched"
  | "needs-momentum"
  | "charities";

type RelatedFundraiserCandidate = {
  id: string;
  goal: number | string | null;
  raised: number | string | null;
  raised_amount: number | string | null;
  created_at: string | null;
  category: string | null;
};

const CLOSE_TO_TARGET_RATIO = 0.95;
const JUST_LAUNCHED_MAX_AGE_DAYS = 2;
// A fundraiser needs time to gather donations before "low raised/goal ratio"
// means anything — a campaign that's a day old at 0% isn't struggling, it
// just started. A week seems like a reasonable point past which a low ratio
// starts to actually signal stalled momentum rather than just being new.
const NEEDS_MOMENTUM_MIN_AGE_DAYS = 7;
const CHARITY_CATEGORY_VALUE = "Charity";

function fundraiserRatio(row: RelatedFundraiserCandidate): number {
  const goal = Number(row.goal ?? 0);
  if (goal <= 0) return 0;
  return Number(row.raised ?? 0) / goal;
}

function fundraiserAgeDays(row: RelatedFundraiserCandidate): number {
  if (!row.created_at) return 0;
  return (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
}

function shuffledIds(rows: RelatedFundraiserCandidate[]): string[] {
  const ids = rows.map((row) => row.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function pickIdsForCategory(
  candidates: RelatedFundraiserCandidate[],
  category: RelatedFundraiserCategory,
  count: number
): string[] {
  switch (category) {
    case "close-to-target":
      return candidates
        .filter((row) => fundraiserRatio(row) >= CLOSE_TO_TARGET_RATIO)
        .sort((a, b) => fundraiserRatio(b) - fundraiserRatio(a))
        .slice(0, count)
        .map((row) => row.id);
    case "just-launched":
      return candidates
        .filter((row) => fundraiserAgeDays(row) <= JUST_LAUNCHED_MAX_AGE_DAYS)
        .sort((a, b) => fundraiserAgeDays(a) - fundraiserAgeDays(b))
        .slice(0, count)
        .map((row) => row.id);
    case "needs-momentum":
      return candidates
        .filter((row) => fundraiserAgeDays(row) >= NEEDS_MOMENTUM_MIN_AGE_DAYS)
        .sort((a, b) => fundraiserRatio(a) - fundraiserRatio(b))
        .slice(0, count)
        .map((row) => row.id);
    case "charities":
      return candidates
        .filter((row) => row.category === CHARITY_CATEGORY_VALUE)
        .slice(0, count)
        .map((row) => row.id);
    case "worldwide":
    default:
      return shuffledIds(candidates).slice(0, count);
  }
}

/**
 * Selection of other fundraisers for the "More ways to make a difference"
 * section — excludes the current fundraiser, refreshed on every call (no
 * caching). Supports 5 view categories via the `category` param, matching
 * the section's filter dropdown; "worldwide" (the default) is the original
 * random selection.
 *
 * Still two queries, not N, for every category: fetch every *other*
 * fundraiser's lightweight filtering columns (id, goal, raised, created_at,
 * category — cheap, no per-row work), pick/sort/filter in JS, then one
 * targeted `.in(...)` fetch for just the picked rows' full display columns.
 * This is the exact shape of query this codebase got burned by before
 * avoiding — getOptionalEventFields firing one query *per row* (22 queries,
 * ~51s) is the pattern being guarded against here, and this stays two total
 * round trips regardless of how many fundraisers exist or which category is
 * selected, not one round trip per card or per filter.
 *
 * A single SQL function (`ORDER BY random() LIMIT n` for "worldwide", a
 * `WHERE`/`ORDER BY` per other category) would be the more "textbook"
 * single-round-trip version of this — genuinely worth doing if this ever
 * needs applying against a live database, since fetching all rows with no
 * filter/status column (checked: none exists on this table) is simplest for
 * now given the table's actual size (11 rows in dev, and this platform's
 * realistic active-fundraiser count).
 */
export async function getRelatedFundraisers(
  excludeId: string,
  count = 10,
  category: RelatedFundraiserCategory = "worldwide"
): Promise<RelatedFundraiser[]> {
  const { data: candidateRows } = await supabase
    .from("fundraisers")
    .select("id, goal, raised, raised_amount, created_at, category")
    .neq("id", excludeId);

  const candidates = (candidateRows ?? []) as RelatedFundraiserCandidate[];
  if (candidates.length === 0) return [];

  const pickedIds = pickIdsForCategory(candidates, category, count);
  if (pickedIds.length === 0) return [];

  const { data } = await supabase
    .from("fundraisers")
    .select(
      "id, title, slug, banner, image_url, organizer, goal, raised, raised_amount"
    )
    .in("id", pickedIds);

  // `.in(...)` doesn't preserve row order, so re-sort to match the
  // category-specific ranking computed above (closest-to-target first,
  // newest first, etc.) rather than whatever order Postgres returns.
  const rowsById = new Map(
    ((data ?? []) as RelatedFundraiser[]).map((row) => [row.id, row])
  );
  return pickedIds
    .map((id) => rowsById.get(id))
    .filter((row): row is RelatedFundraiser => Boolean(row));
}

export type FundraiserListItem = {
  id: string;
  title: string;
  slug: string;
  goal: number;
  raised: number;
  image: string;
  category: string | null;
  organizer: string | null;
  isFeatured: boolean;
  createdAt: string | null;
};

export type FundraiserListSort = "newest" | "raised" | "goal";

/**
 * Behavioural "smart" filters for the /fundraisers discovery dropdown. Unlike
 * `sort`, these both filter and rank on computed signals (raised/goal ratio,
 * age, donation velocity) that PostgREST can't express, so they route through
 * a JS-side ranking path — see getSmartFilteredFundraiserList.
 */
export type FundraiserSmartFilter =
  | "all"
  | "close-to-target"
  | "just-launched"
  | "needs-momentum"
  | "trending";

export type FundraiserListParams = {
  categories?: string[];
  excludeIds?: string[];
  featuredOnly?: boolean;
  searchQuery?: string;
  sort?: FundraiserListSort;
  smartFilter?: FundraiserSmartFilter;
  page?: number;
  pageSize?: number;
};

export type FundraiserListResult = {
  fundraisers: FundraiserListItem[];
  total: number;
};

/**
 * PostgREST's `.or()` filter string treats `,` `.` `(` `)` as grammar
 * (clause separators / grouping), not literal characters — passing raw user
 * input straight into the template lets someone break out of the intended
 * `title.ilike.%x%,category.ilike.%x%` filter and inject additional clauses.
 * Wrapping the value in double quotes makes PostgREST treat everything
 * inside literally; only `\` and `"` then need escaping so the value can't
 * terminate the quoted string early.
 */
export function escapePostgrestOrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

type FundraiserListRow = {
  id: string;
  title: string;
  slug: string;
  goal: number | string | null;
  raised: number | string | null;
  raised_amount: number | string | null;
  banner: string | null;
  image_url: string | null;
  category: string | null;
  organizer: string | null;
  created_at: string | null;
  is_featured: boolean | null;
};

/** Shared row → card mapping, used by both the SQL and smart-filter paths. */
function mapFundraiserRow(row: FundraiserListRow): FundraiserListItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    goal: Number(row.goal ?? 0),
    raised: Number(row.raised ?? 0),
    image: normalizeImageUrl(row.image_url || row.banner, FUNDRAISER_FALLBACK_IMAGE),
    category: row.category ?? null,
    organizer: row.organizer ?? null,
    isFeatured: row.is_featured === true,
    createdAt: row.created_at,
  };
}

/**
 * Shared browse/list query for the `/fundraisers` grid and `CampaignShowcase`.
 * Every sort adds `id` as a secondary tie-breaker — without it, rows with
 * equal `raised`/`goal` values (e.g. many campaigns sitting at 0) have no
 * guaranteed stable order across separate `.range()` page requests, so a
 * tied campaign can shuffle onto the wrong page and appear twice (or be
 * skipped) when paginating. `excludeIds` lets callers keep a featured pick
 * out of the grid below it, rather than fetching both independently and
 * letting the same campaign render in two sections at once.
 */
export async function getFundraiserList(
  params: FundraiserListParams = {}
): Promise<FundraiserListResult> {
  // Behavioural filters rank on computed signals PostgREST can't express, so
  // they take a dedicated JS-side path; the SQL path below is left untouched.
  const smartFilter = params.smartFilter ?? "all";
  if (smartFilter !== "all") {
    return getSmartFilteredFundraiserList(smartFilter, params);
  }

  const categories = params.categories;
  const excludeIds = params.excludeIds;
  const featuredOnly = params.featuredOnly ?? false;
  const searchQuery = params.searchQuery;
  const sort = params.sort ?? "newest";
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;

  let query = supabase
    .from("fundraisers")
    .select(
      "id, title, slug, goal, raised, raised_amount, banner, image_url, category, organizer, created_at, is_featured",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .eq("status", "published");

  if (searchQuery) {
    const safeSearchQuery = escapePostgrestOrValue(searchQuery);
    query = query.or(
      `title.ilike."%${safeSearchQuery}%",category.ilike."%${safeSearchQuery}%"`
    );
  }
  if (categories && categories.length > 0) {
    query = query.in("category", categories);
  }
  if (featuredOnly) {
    query = query.eq("is_featured", true);
  }
  if (excludeIds && excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  if (sort === "raised") {
    query = query.order("raised", { ascending: false }).order("id", { ascending: true });
  } else if (sort === "goal") {
    query = query.order("goal", { ascending: false }).order("id", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: true });
  }

  const from = (page - 1) * pageSize;
  const { data, count } = await query.range(from, from + pageSize - 1);

  const rows = (data ?? []) as unknown as FundraiserListRow[];
  const fundraisers = rows.map(mapFundraiserRow);

  return { fundraisers, total: count ?? 0 };
}

// Smart-filter thresholds — deliberately tuned for the current small catalogue
// (~11 campaigns; newest ~2 weeks old; all but one under 20% funded). They are
// intentionally wide so no bucket is empty today, and are meant to tighten as
// real volume arrives (e.g. "just launched" back down toward 7 days). See the
// data snapshot in the PR that introduced this.
const SMART_CLOSE_TO_TARGET_RATIO = 0.9;
const SMART_JUST_LAUNCHED_MAX_AGE_DAYS = 30;
const SMART_NEEDS_MOMENTUM_MAX_RATIO = 0.2;
// Kept >= the "just launched" window so the two buckets stay disjoint: a
// 2-week-old campaign at 0% is new, not stalled.
const SMART_NEEDS_MOMENTUM_MIN_AGE_DAYS = 30;
const DAY_MS = 1000 * 60 * 60 * 24;

/** Displayed raised value — matches mapFundraiserRow (`raised`). */
function rowEffectiveRaised(row: FundraiserListRow): number {
  return Number(row.raised ?? 0);
}

function rowRatio(row: FundraiserListRow): number {
  const goal = Number(row.goal ?? 0);
  if (goal <= 0) return 0;
  return rowEffectiveRaised(row) / goal;
}

function rowAgeDays(row: FundraiserListRow): number {
  if (!row.created_at) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(row.created_at).getTime()) / DAY_MS;
}

/**
 * Donation counts per fundraiser (succeeded/completed only) — mirrors the
 * `donorCounts` query in `app/fundraisers/FundraisersBrowseSection.tsx`
 * (which wraps this in `'use cache'` itself — this file is also imported by
 * client components via `RelatedFundraiserCarousel`, so it can't define
 * inline `'use cache'` functions), reusing existing donation data rather
 * than any new tracking. Also used for the "trending" smart-filter bucket.
 *
 * Uses the admin client: RLS on `donations` only allows a row's own
 * `user_id` or an admin to `SELECT` it, so the anon client this file
 * otherwise uses for public fundraiser data would always return zero rows
 * here regardless of caller — donor counts are an aggregate, not exposing
 * any individual donation's private fields.
 */
export async function fetchDonationCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const adminClient = createSupabaseAdmin();
  const { data } = await adminClient
    .from("donations")
    .select("fundraiser_id")
    .in("fundraiser_id", ids)
    .in("status", ["succeeded", "completed"]);

  for (const row of (data ?? []) as { fundraiser_id: string | null }[]) {
    if (row.fundraiser_id) {
      counts.set(row.fundraiser_id, (counts.get(row.fundraiser_id) ?? 0) + 1);
    }
  }
  return counts;
}

function rankSmartFilter(
  rows: FundraiserListRow[],
  smartFilter: Exclude<FundraiserSmartFilter, "all">,
  donationCounts: Map<string, number>
): FundraiserListRow[] {
  switch (smartFilter) {
    case "close-to-target":
      return rows
        .filter((row) => rowRatio(row) >= SMART_CLOSE_TO_TARGET_RATIO)
        .sort((a, b) => rowRatio(b) - rowRatio(a));
    case "just-launched":
      return rows
        .filter((row) => rowAgeDays(row) <= SMART_JUST_LAUNCHED_MAX_AGE_DAYS)
        .sort((a, b) => rowAgeDays(a) - rowAgeDays(b));
    case "needs-momentum":
      return rows
        .filter(
          (row) =>
            rowRatio(row) < SMART_NEEDS_MOMENTUM_MAX_RATIO &&
            rowAgeDays(row) >= SMART_NEEDS_MOMENTUM_MIN_AGE_DAYS
        )
        // Lowest progress first; oldest breaks ties — the most stalled surface first.
        .sort((a, b) => rowRatio(a) - rowRatio(b) || rowAgeDays(b) - rowAgeDays(a));
    case "trending": {
      // Donations per day since launch — rewards recent traction over raw totals.
      const velocity = (row: FundraiserListRow) =>
        (donationCounts.get(row.id) ?? 0) / Math.max(rowAgeDays(row), 1);
      return rows
        .filter((row) => (donationCounts.get(row.id) ?? 0) > 0)
        .sort((a, b) => velocity(b) - velocity(a));
    }
  }
}

/**
 * JS-side ranking path for the behavioural smart filters. Fetches the (small)
 * catalogue once and ranks in memory — the same fetch-all-then-rank approach
 * as getRelatedFundraisers, and for the same reason: ratio/velocity ordering
 * isn't expressible in PostgREST without an RPC. Returns the same shape as the
 * SQL path so callers are agnostic. The SQL path's dedup, featured-only, and
 * injection-safe search logic are untouched by this.
 */
async function getSmartFilteredFundraiserList(
  smartFilter: Exclude<FundraiserSmartFilter, "all">,
  params: FundraiserListParams
): Promise<FundraiserListResult> {
  const categories = params.categories;
  const excludeIds = params.excludeIds;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;

  let query = supabase
    .from("fundraisers")
    .select(
      "id, title, slug, goal, raised, raised_amount, banner, image_url, category, organizer, created_at, is_featured"
    )
    .is("deleted_at", null)
    .eq("status", "published");
  if (categories && categories.length > 0) {
    query = query.in("category", categories);
  }

  const { data } = await query;
  let rows = (data ?? []) as unknown as FundraiserListRow[];

  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    rows = rows.filter((row) => !excluded.has(row.id));
  }

  const donationCounts =
    smartFilter === "trending"
      ? await fetchDonationCounts(rows.map((row) => row.id))
      : new Map<string, number>();

  const ranked = rankSmartFilter(rows, smartFilter, donationCounts);
  const from = (page - 1) * pageSize;
  const pageRows = ranked.slice(from, from + pageSize);

  return { fundraisers: pageRows.map(mapFundraiserRow), total: ranked.length };
}

/**
 * Resolve an editorially-curated, ordered list of campaign slugs to their
 * display images — used by the Hero, which is intentionally hand-picked, not
 * algorithmic (see lib/fundraiser-hero-curation.ts).
 *
 * Order is preserved (`.in()` does not preserve it, so we re-map by slug).
 * Any slug that is missing, or whose image doesn't resolve to a real,
 * allowed-host URL, is skipped — so a curated-but-image-less campaign simply
 * doesn't appear rather than rendering a stock placeholder.
 */
export async function getCuratedFundraiserImages(
  slugs: readonly string[]
): Promise<string[]> {
  if (slugs.length === 0) return [];

  const { data } = await supabase
    .from("fundraisers")
    .select("slug, banner, image_url")
    .in("slug", slugs as string[]);

  const bySlug = new Map(
    ((data ?? []) as { slug: string; banner: string | null; image_url: string | null }[]).map(
      (row) => [row.slug, row]
    )
  );

  const images: string[] = [];
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (!row) continue;
    // Empty-string fallback: an unusable/disallowed image resolves to "" and is
    // dropped, rather than substituting the stock fallback image.
    const normalized = normalizeImageUrl(row.image_url || row.banner, "");
    if (normalized && normalized !== FUNDRAISER_FALLBACK_IMAGE) {
      images.push(normalized);
    }
  }
  return images;
}
