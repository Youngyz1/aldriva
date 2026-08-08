import Link from "next/link";
import { X } from "lucide-react";
import { getLatestArticles, getAuthorProfileMap } from "@/lib/articles-data";
import ArticleCard from "@/components/ArticleCard";
import PublicPagination from "@/components/public/PublicPagination";

const PAGE_SIZE = 9;

export type LatestArticlesFilters = {
  page?: string;
  q?: string;
  category?: string;
};

function buildQuery(overrides: Partial<{ page: number; q: string; category: string }>, current: {
  page: number;
  q?: string;
  category?: string;
}) {
  const params = new URLSearchParams();
  const page = overrides.page ?? current.page;
  const q = overrides.q !== undefined ? overrides.q : current.q;
  const category = overrides.category !== undefined ? overrides.category : current.category;

  if (page > 1) params.set("page", String(page));
  if (q) params.set("q", q);
  if (category) params.set("category", category);

  const qs = params.toString();
  return qs ? `/articles?${qs}#latest-articles` : "/articles#latest-articles";
}

export default async function LatestArticlesSection({
  searchParams,
}: {
  searchParams: Promise<LatestArticlesFilters>;
}) {
  const { page: pageStr, q, category } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);

  const { articles, totalCount } = await getLatestArticles({ page, pageSize: PAGE_SIZE, q, category });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const authorMap = await getAuthorProfileMap(articles.map((a) => a.owner_id));

  const hasActiveFilters = Boolean(q || category);

  return (
    <section id="latest-articles" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">The Archive</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Latest Articles</h2>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {q && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-700">
                &quot;{q}&quot;
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">
                {category}
              </span>
            )}
            <Link
              href="/articles#latest-articles"
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-500 transition hover:border-orange-200 hover:text-orange-600"
            >
              <X className="h-3 w-3" />
              Clear
            </Link>
          </div>
        )}
      </div>

      {articles.length > 0 ? (
        <>
          {/* CSS-columns masonry: card heights vary naturally with excerpt length. */}
          <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
            {articles.map((article) => {
              const author = authorMap.get(article.owner_id);
              return (
                <div key={article.id} className="mb-6 break-inside-avoid">
                  <ArticleCard
                    title={article.title}
                    excerpt={article.excerpt}
                    coverImage={article.cover_image_url}
                    slug={article.slug}
                    categories={article.categories ?? []}
                    tags={article.tags ?? []}
                    readingTime={article.reading_time}
                    publishedAt={article.published_at}
                    createdAt={article.created_at}
                    author={{
                      name: author?.display_name || "Community Author",
                      avatarUrl: author?.avatar_url ?? null,
                    }}
                    showActions
                  />
                </div>
              );
            })}
          </div>

          <PublicPagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={(p) => buildQuery({ page: p }, { page, q, category })}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
          <p className="text-sm font-bold text-zinc-500">
            {hasActiveFilters ? "No articles match your search." : "No articles published yet."}
          </p>
        </div>
      )}
    </section>
  );
}
