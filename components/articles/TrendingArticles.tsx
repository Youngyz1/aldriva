import Image from "next/image";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { cacheLife } from "next/cache";
import {
  getFeaturedArticles,
  getTrendingArticles,
  getAuthorProfileMap,
  ARTICLE_FALLBACK_IMAGE,
} from "@/lib/articles-data";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export default async function TrendingArticles() {
  "use cache";
  cacheLife({ revalidate: 300 });

  // Excludes whatever Featured Stories is showing so the two sections don't
  // repeat the same articles back to back.
  const featured = await getFeaturedArticles(4);
  const articles = await getTrendingArticles(6, featured.map((a) => a.id));
  if (articles.length === 0) return null;

  const authorMap = await getAuthorProfileMap(articles.map((a) => a.owner_id));

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">Hot right now</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Trending Articles</h2>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => {
          const author = authorMap.get(article.owner_id);
          const authorName = author?.display_name || "Community Author";

          return (
            <Link
              key={article.id}
              href={`/articles/${article.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="relative h-40 w-full overflow-hidden bg-zinc-100">
                <Image
                  src={article.cover_image_url?.trim() || ARTICLE_FALLBACK_IMAGE}
                  alt={article.title}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow">
                  <TrendingUp className="h-3 w-3" />
                  Trending
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4">
                {article.categories?.[0] && (
                  <span className="text-[10px] font-black uppercase tracking-wide text-orange-600">
                    {article.categories[0]}
                  </span>
                )}
                <h3 className="mt-1 line-clamp-2 text-base font-black leading-snug text-zinc-950 group-hover:text-orange-600 transition">
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-500">{article.excerpt}</p>
                )}

                <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
                  {author?.avatar_url ? (
                    <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
                      <Image src={author.avatar_url} alt={authorName} fill sizes="24px" className="object-cover" />
                    </div>
                  ) : (
                    <LocalBrandedPlaceholder
                      variant="avatar"
                      title={authorName}
                      initials={authorName.slice(0, 2).toUpperCase()}
                      className="h-6 w-6 shrink-0 rounded-full from-orange-600 to-orange-600 text-[9px]"
                    />
                  )}
                  <span className="truncate text-xs font-bold text-zinc-600">{authorName}</span>
                  {article.reading_time && (
                    <span className="ml-auto shrink-0 text-xs font-semibold text-zinc-400">
                      {article.reading_time} min read
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
