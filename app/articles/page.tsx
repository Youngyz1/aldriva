import { createSupabaseAdmin } from "@/lib/supabase-admin";
import ArticleCard from "@/components/ArticleCard";
import PublicPagination from "@/components/public/PublicPagination";
import Link from "next/link";

export const revalidate = 60; // Cache for 60 seconds

const PAGE_SIZE = 9;

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  const supabase = createSupabaseAdmin();
  const nowStr = new Date().toISOString();

  // Get total count of active published public articles
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowStr);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch paginated active articles
  const { data: articles } = await supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowStr)
    .order("published_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Fetch unique categories and tags for filter links
  const { data: allCatsAndTags } = await supabase
    .from("articles")
    .select("categories, tags")
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowStr);

  const uniqueCategories = Array.from(
    new Set((allCatsAndTags ?? []).flatMap((a) => a.categories || []))
  ).sort();

  const uniqueTags = Array.from(
    new Set((allCatsAndTags ?? []).flatMap((a) => a.tags || []))
  ).sort();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-6 md:py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">
          Articles &amp; Stories
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base font-bold text-zinc-500 sm:text-lg">
          Insights, updates, and community highlights from the Aldriva community.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        {/* Main Grid */}
        <div className="lg:col-span-3">
          {articles && articles.length > 0 ? (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    title={article.title}
                    excerpt={article.excerpt}
                    coverImage={article.cover_image_url}
                    slug={article.slug}
                    categories={article.categories}
                    tags={article.tags}
                    readingTime={article.reading_time}
                    publishedAt={article.published_at}
                    createdAt={article.created_at}
                  />
                ))}
              </div>
              <PublicPagination
                currentPage={page}
                totalPages={totalPages}
                buildHref={(p) => `/articles?page=${p}`}
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
              <p className="text-sm font-bold text-zinc-500">No articles found.</p>
            </div>
          )}
        </div>

        {/* Sidebar Filters */}
        <div className="space-y-8 lg:col-span-1">
          {/* Categories */}
          {uniqueCategories.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400">
                Categories
              </h3>
              <div className="mt-4 flex flex-col gap-2">
                {uniqueCategories.map((cat) => (
                  <Link
                    key={cat}
                    href={`/articles/category/${encodeURIComponent(cat.toLowerCase())}`}
                    className="flex items-center justify-between text-sm font-bold text-zinc-700 hover:text-orange-600 transition"
                  >
                    <span>{cat}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {uniqueTags.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400">
                Popular Tags
              </h3>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {uniqueTags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/articles/tag/${encodeURIComponent(tag.toLowerCase())}`}
                    className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-600 hover:bg-orange-50 hover:text-orange-600 transition"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
