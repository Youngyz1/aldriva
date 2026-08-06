import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Shared read helpers for the Articles landing page. Every function here
 * queries real rows already produced by the existing article publishing flow
 * (lib/actions/articles.ts) — nothing here writes data or introduces new
 * tables/columns. There is no views/likes/followers counter in the schema,
 * so those stats are deliberately not faked anywhere in this module; callers
 * that want a "trending" or "featured" signal get one derived from real,
 * inspectable fields (recency, reading time, published article count).
 */

export const ARTICLE_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop";

export type ArticleRow = {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  reading_time: number | null;
  published_at: string | null;
  created_at: string;
};

export type AuthorProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const ARTICLE_LIST_COLUMNS =
  "id, owner_id, title, slug, excerpt, cover_image_url, categories, tags, reading_time, published_at, created_at";

/**
 * Builds a fresh, filtered "published + public" articles query with the
 * given select clause. Always call this with the exact columns you need —
 * chaining a second `.select()` onto an already-built query isn't reliably
 * supported by the query builder's types, so each caller gets its own query
 * from a single `.select()` call instead of sharing/mutating one builder.
 */
function publishedArticlesQuery(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  columns: string,
  options?: { count?: "exact"; head?: boolean }
) {
  const nowIso = new Date().toISOString();
  return supabaseAdmin
    .from("articles")
    .select(columns, options)
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowIso);
}

/** Batch-resolves author display info via the public-safe `public_profiles` view. */
export async function getAuthorProfileMap(
  ownerIds: string[]
): Promise<Map<string, AuthorProfile>> {
  const ids = Array.from(new Set(ownerIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("public_profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);

  return new Map(((data ?? []) as AuthorProfile[]).map((profile) => [profile.id, profile]));
}

/** Most recently published articles — the landing page's "Featured Stories" pool. */
export async function getFeaturedArticles(limit: number): Promise<ArticleRow[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await publishedArticlesQuery(supabaseAdmin, ARTICLE_LIST_COLUMNS)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ArticleRow[];
}

/**
 * "Trending" proxy: articles published in the last 30 days, quickest reads
 * first. There's no view/like/comment counter on articles to rank by, so
 * this is an honest recency + reading-time heuristic rather than real
 * engagement data — falls back to the newest articles overall if nothing
 * published in the last 30 days.
 */
export async function getTrendingArticles(limit: number, excludeIds: string[] = []): Promise<ArticleRow[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let query = publishedArticlesQuery(supabaseAdmin, ARTICLE_LIST_COLUMNS).gte(
    "published_at",
    thirtyDaysAgo
  );
  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data } = await query
    .order("reading_time", { ascending: true, nullsFirst: false })
    .order("published_at", { ascending: false })
    .limit(limit);

  if (data && data.length > 0) return data as unknown as ArticleRow[];

  // Nothing in the last 30 days — fall back to newest overall (still real data).
  let fallbackQuery = publishedArticlesQuery(supabaseAdmin, ARTICLE_LIST_COLUMNS);
  if (excludeIds.length > 0) {
    fallbackQuery = fallbackQuery.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const { data: fallback } = await fallbackQuery.order("published_at", { ascending: false }).limit(limit);
  return (fallback ?? []) as unknown as ArticleRow[];
}

export type LatestArticlesFilters = {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
};

export async function getLatestArticles({
  page,
  pageSize,
  q,
  category,
}: LatestArticlesFilters): Promise<{ articles: ArticleRow[]; totalCount: number }> {
  const supabaseAdmin = createSupabaseAdmin();

  let countQuery = publishedArticlesQuery(supabaseAdmin, "id", { count: "exact", head: true });
  let dataQuery = publishedArticlesQuery(supabaseAdmin, ARTICLE_LIST_COLUMNS);

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    countQuery = countQuery.or(`title.ilike.${term},excerpt.ilike.${term}`);
    dataQuery = dataQuery.or(`title.ilike.${term},excerpt.ilike.${term}`);
  }

  if (category && category.trim()) {
    countQuery = countQuery.contains("categories", [category]);
    dataQuery = dataQuery.contains("categories", [category]);
  }

  const { count } = await countQuery;

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;
  const { data } = await dataQuery.order("published_at", { ascending: false }).range(from, to);

  return { articles: (data ?? []) as unknown as ArticleRow[], totalCount: count ?? 0 };
}

export type TopWriter = {
  author: AuthorProfile;
  articleCount: number;
};

/**
 * Ranks authors by their real published-article count. Computed in
 * application code (not a SQL GROUP BY / RPC) since there's no aggregate
 * view for this yet — cheap for the current table size (single-column scan)
 * and avoids introducing new backend logic.
 */
export async function getTopWriters(limit: number): Promise<TopWriter[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data } = await supabaseAdmin
    .from("articles")
    .select("owner_id")
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowIso);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const ownerId = (row as { owner_id: string }).owner_id;
    counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
  }

  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const authorMap = await getAuthorProfileMap(ranked.map(([ownerId]) => ownerId));

  return ranked
    .map(([ownerId, articleCount]) => {
      const author = authorMap.get(ownerId);
      if (!author) return null;
      return { author, articleCount };
    })
    .filter((entry): entry is TopWriter => entry !== null);
}

/** Real distinct categories currently in use across published articles. */
export async function getDistinctArticleCategories(): Promise<string[]> {
  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await publishedArticlesQuery(supabaseAdmin, "categories");

  const set = new Set<string>();
  for (const row of (data ?? []) as unknown as { categories: string[] | null }[]) {
    for (const cat of row.categories ?? []) {
      if (cat && cat.trim()) set.add(cat.trim());
    }
  }
  return Array.from(set).sort();
}
