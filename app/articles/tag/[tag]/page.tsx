import { createSupabaseAdmin } from "@/lib/supabase-admin";
import ArticleCard from "@/components/ArticleCard";
import PublicPagination from "@/components/public/PublicPagination";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 60;

const PAGE_SIZE = 9;

export default async function TagArticlesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tag: tagParam } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  const supabase = createSupabaseAdmin();
  const nowStr = new Date().toISOString();

  // Get distinct tags to map the url slug parameter back to the case-sensitive tag name
  const { data: allTagsData } = await supabase
    .from("articles")
    .select("tags")
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowStr);

  const decodedTagParam = decodeURIComponent(tagParam).toLowerCase();
  const matchedTag = Array.from(
    new Set((allTagsData ?? []).flatMap((a) => a.tags || []))
  ).find((t) => t.toLowerCase() === decodedTagParam);

  if (!matchedTag) {
    notFound();
  }

  // Get count of articles containing this tag
  const { count } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowStr)
    .contains("tags", [matchedTag]);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch paginated filtered articles
  const { data: articles } = await supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", nowStr)
    .contains("tags", [matchedTag])
    .order("published_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-6 md:py-12">
      {/* Back Link */}
      <Link
        href="/articles"
        className="inline-flex items-center text-sm font-bold text-zinc-500 hover:text-orange-600 transition mb-6"
      >
        ← All articles
      </Link>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
          Tag: <span className="text-orange-600">#{matchedTag}</span>
        </h1>
        <p className="mt-2 text-sm font-bold text-zinc-500">
          Showing {totalCount} {totalCount === 1 ? "article" : "articles"} tagged with #{matchedTag}.
        </p>
      </div>

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
            buildHref={(p) => `/articles/tag/${encodeURIComponent(tagParam)}?page=${p}`}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
          <p className="text-sm font-bold text-zinc-500">No articles found with this tag.</p>
        </div>
      )}
    </main>
  );
}
