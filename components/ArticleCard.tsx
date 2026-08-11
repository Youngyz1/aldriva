import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import ArticleCardActions from "@/components/articles/ArticleCardActions";

export type ArticleCardAuthor = {
  name: string;
  avatarUrl: string | null;
};

type ArticleCardProps = {
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  slug: string;
  categories: string[];
  tags: string[];
  readingTime: number | null;
  publishedAt: string | null;
  createdAt: string;
  className?: string;
  /** Optional author byline (avatar + name). Omit to keep the original date/reading-time-only header. */
  author?: ArticleCardAuthor | null;
  /** Renders like/bookmark toggle buttons (local-only, see ArticleCardActions). */
  showActions?: boolean;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop";

export default function ArticleCard({
  title,
  excerpt,
  coverImage,
  slug,
  categories,
  tags,
  readingTime,
  publishedAt,
  createdAt,
  className,
  author,
  showActions,
}: ArticleCardProps) {
  // Use URL as-is; unoptimized prop below bypasses remotePatterns host checks
  const imageSrc = coverImage?.trim() || FALLBACK_IMAGE;
  const displayDate = new Date(publishedAt || createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
        className
      )}
    >
      {/*
        Plain <a>, not next/link's <Link>: /articles/[slug] lives under
        app/(gated)/layout.tsx, a separate root layout (own <html>/<body>)
        from the one this card renders under. Per Next's own route-groups
        docs, crossing between root layouts is supposed to auto-upgrade to a
        full page reload — but in practice that detection doesn't kick in
        reliably here, and the client-side transition instead tries to mount
        a second <html> inside the first one, crashing with
        "insertBefore/removeChild" DOM errors (surfaces as a 500). A plain
        anchor sidesteps Next's router entirely for this specific hop, which
        costs nothing since it was always going to be a full reload anyway.
      */}
      <a href={`/articles/${slug}`} className="relative h-44 sm:h-52 w-full bg-zinc-100 block">
        <Image
          src={imageSrc}
          alt={title}
          fill
          unoptimized
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
        {categories[0] && (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-orange-700 shadow-sm backdrop-blur">
            {categories[0]}
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col p-4">
        {/* Date & Reading time */}
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
          <span>{displayDate}</span>
          {readingTime && (
            <>
              <span>•</span>
              <span>{readingTime} min read</span>
            </>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-2 line-clamp-2 text-base font-black leading-snug text-zinc-950 sm:text-lg hover:text-orange-600 transition">
          <a href={`/articles/${slug}`}>{title}</a>
        </h3>

        {/* Excerpt */}
        {excerpt && (
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-500">
            {excerpt}
          </p>
        )}

        {/* Author byline */}
        {author && (
          <div className="mt-4 flex items-center gap-2">
            {author.avatarUrl ? (
              <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full">
                <Image src={author.avatarUrl} alt={author.name} fill sizes="28px" className="object-cover" />
              </div>
            ) : (
              <LocalBrandedPlaceholder
                variant="avatar"
                title={author.name}
                initials={author.name.slice(0, 2).toUpperCase()}
                className="h-7 w-7 shrink-0 rounded-full from-orange-600 to-orange-600 text-[10px]"
              />
            )}
            <span className="truncate text-xs font-bold text-zinc-700">{author.name}</span>
          </div>
        )}

        <div className="mt-auto">
          {/* Categories */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {categories.slice(0, 3).map((cat) => (
              <Link
                key={cat}
                href={`/articles/category/${encodeURIComponent(cat.toLowerCase())}`}
                className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-black text-orange-700 hover:bg-orange-100 transition"
              >
                {cat}
              </Link>
            ))}
          </div>

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-3 flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag) => (
                <Link
                  key={tag}
                  href={`/articles/tag/${encodeURIComponent(tag.toLowerCase())}`}
                  className="text-[10px] font-bold text-zinc-400 hover:text-orange-600 transition"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* Like / bookmark actions */}
          {showActions && (
            <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3">
              <ArticleCardActions articleSlug={slug} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
