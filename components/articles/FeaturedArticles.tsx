import Image from "next/image";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { getFeaturedArticles, getAuthorProfileMap, ARTICLE_FALLBACK_IMAGE } from "@/lib/articles-data";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

function displayDate(publishedAt: string | null, createdAt: string) {
  return new Date(publishedAt || createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function FeaturedArticles() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const articles = await getFeaturedArticles(4);
  if (articles.length === 0) return null;

  const authorMap = await getAuthorProfileMap(articles.map((a) => a.owner_id));
  const [lead, ...rest] = articles;
  const leadAuthor = authorMap.get(lead.owner_id);
  const leadAuthorName = leadAuthor?.display_name || "Community Author";

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mb-8 sm:mb-10">
        <p className="text-xs font-black uppercase tracking-widest text-orange-600">Editor&apos;s Picks</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Featured Stories</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
        {/* Large lead card */}
        <Link
          href={`/articles/${lead.slug}`}
          className="group relative flex h-[420px] flex-col justify-end overflow-hidden rounded-3xl shadow-lg transition hover:-translate-y-0.5 hover:shadow-2xl sm:h-[480px] lg:col-span-3"
        >
          <Image
            src={lead.cover_image_url?.trim() || ARTICLE_FALLBACK_IMAGE}
            alt={lead.title}
            fill
            unoptimized
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

          <div className="relative p-6 sm:p-8">
            {lead.categories?.[0] && (
              <span className="inline-block rounded-full bg-orange-600 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                {lead.categories[0]}
              </span>
            )}
            <h3 className="mt-4 line-clamp-3 text-2xl font-black leading-tight text-white sm:text-3xl">
              {lead.title}
            </h3>
            {lead.excerpt && (
              <p className="mt-3 line-clamp-2 max-w-2xl text-sm font-medium text-zinc-200 sm:text-base">
                {lead.excerpt}
              </p>
            )}
            <div className="mt-5 flex items-center gap-3">
              {leadAuthor?.avatar_url ? (
                <div className="relative h-9 w-9 overflow-hidden rounded-full ring-2 ring-white/20">
                  <Image src={leadAuthor.avatar_url} alt={leadAuthorName} fill sizes="36px" className="object-cover" />
                </div>
              ) : (
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={leadAuthorName}
                  initials={leadAuthorName.slice(0, 2).toUpperCase()}
                  className="h-9 w-9 rounded-full from-orange-600 to-orange-600 text-xs ring-2 ring-white/20"
                />
              )}
              <div className="text-xs font-bold text-zinc-200">
                <p className="text-white">{leadAuthorName}</p>
                <p className="text-zinc-400">
                  {displayDate(lead.published_at, lead.created_at)}
                  {lead.reading_time ? ` • ${lead.reading_time} min read` : ""}
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Three smaller stacked cards */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {rest.map((article) => {
            const author = authorMap.get(article.owner_id);
            const authorName = author?.display_name || "Community Author";
            return (
              <Link
                key={article.id}
                href={`/articles/${article.slug}`}
                className="group flex gap-4 rounded-2xl border border-zinc-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:h-28 sm:w-28">
                  <Image
                    src={article.cover_image_url?.trim() || ARTICLE_FALLBACK_IMAGE}
                    alt={article.title}
                    fill
                    unoptimized
                    sizes="112px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  {article.categories?.[0] && (
                    <span className="text-[10px] font-black uppercase tracking-wide text-orange-600">
                      {article.categories[0]}
                    </span>
                  )}
                  <h4 className="mt-1 line-clamp-2 text-sm font-black leading-snug text-zinc-950 group-hover:text-orange-600 transition sm:text-base">
                    {article.title}
                  </h4>
                  <p className="mt-1.5 truncate text-xs font-semibold text-zinc-500">
                    {authorName} • {displayDate(article.published_at, article.created_at)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
