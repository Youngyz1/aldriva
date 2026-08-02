import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { compactJsonLd, jsonLdScriptValue } from "@/lib/structured-data";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

// connection() (inside fetchAndGate, called from an explicit <Suspense> boundary
// below) prevents the Turbopack streaming bug where HTTP 200 is flushed before
// notFound() can change it to 404 — force-dynamic is no longer needed for this
// once the gate check runs inside its own Suspense boundary (Cache Components).
// ---------------------------------------------------------------------------
// Shared helper: fetch article + perform gate check.
// Returns the article when access is granted; calls notFound() otherwise.
// ---------------------------------------------------------------------------
async function fetchAndGate(slug: string) {
  // Prevent streaming until this function completes (fixes Turbopack 200 bug).
  await connection();

  const adminClient = createSupabaseAdmin();
  const supabaseServer = await createSupabaseServer();

  const { data: article } = await adminClient
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!article) notFound();

  // Fetch author profile via a plain query — NOT a PostgREST embed.
  // articles.owner_id references auth.users(id), not profiles(id), so
  // PostgREST has no FK to resolve profiles(...) automatically and the
  // embedded join returns an error, causing data to be null → 404.
  const { data: authorProfile } = await adminClient
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", article.owner_id)
    .maybeSingle();

  // Get current user
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  let isAuthorized = false;
  if (user) {
    if (user.id === article.owner_id) {
      isAuthorized = true;
    } else {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();
      if (profile?.role === "admin" && profile?.status === "active") {
        isAuthorized = true;
      }
    }
  }

  const now = new Date();
  const isScheduledInFuture =
    article.status === "scheduled" &&
    article.scheduled_for &&
    new Date(article.scheduled_for) > now;

  const isRestrictedStatus = ["draft", "archived", "expired", "rejected"].includes(
    article.status
  );

  const isPrivate = article.visibility === "private";

  if (isRestrictedStatus || isScheduledInFuture || isPrivate) {
    if (!isAuthorized) notFound();
  }

  return { article, authorProfile, user, isAuthorized, isScheduledInFuture, isRestrictedStatus, isPrivate };
}

// generateMetadata runs BEFORE the page component streams, so notFound() here
// guarantees a proper 404 HTTP status even in Turbopack dev mode.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { article } = await fetchAndGate(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fund4agoodcause.com";
  return {
    title: article.seo_title || article.title,
    description: article.seo_description || article.excerpt || undefined,
    alternates: {
      canonical: article.canonical_url ?? `${siteUrl}/articles/${article.slug}`,
    },
    openGraph: {
      title: article.seo_title || article.title,
      description: article.seo_description || article.excerpt || undefined,
      url: `${siteUrl}/articles/${article.slug}`,
      images: article.cover_image_url ? [{ url: article.cover_image_url }] : [],
    },
  };
}

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // fetchAndGate performs auth check (including connection() call) before
  // any JSX is returned, guaranteeing the 404 fires before streaming starts.
  const { article, authorProfile, isAuthorized, isScheduledInFuture, isRestrictedStatus, isPrivate } =
    await fetchAndGate(slug);

  const imageSrc = article.cover_image_url || FALLBACK_IMAGE;
  const authorName = authorProfile?.display_name || "Community Author";
  const displayDate = new Date(article.published_at || article.created_at).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  // Generate BlogPosting JSON-LD
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fund4agoodcause.com";
  const jsonLd = compactJsonLd({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.excerpt || undefined,
    image: imageSrc,
    datePublished: article.published_at || article.created_at,
    dateModified: article.updated_at,
    author: {
      "@type": "Person",
      name: authorName,
    },
    publisher: {
      "@type": "Organization",
      name: "Aldriva",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/icon.svg`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/articles/${article.slug}`,
    },
  });

  return (
    <>
      {/* BlogPosting JSON-LD Structured Data Injection */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptValue(jsonLd) }}
        />
      )}

      <main className="mx-auto max-w-[800px] px-4 py-8 md:px-6 md:py-12">
        {/* Back Link */}
        <Link
          href="/articles"
          className="inline-flex items-center text-sm font-bold text-zinc-500 hover:text-orange-600 transition mb-8"
        >
          ← Back to articles
        </Link>

        {/* Visibility/Status Warning Banner for Owner/Admin */}
        {isAuthorized && (isRestrictedStatus || isScheduledInFuture || isPrivate) && (
          <div className="mb-8 rounded-xl bg-orange-50 border border-orange-200 p-4 text-sm font-semibold text-orange-800">
            <span className="font-bold">Preview Mode:</span> You are viewing this article as the
            owner/admin. Public status is <span className="underline font-bold">{article.status}</span> and
            visibility is <span className="underline font-bold">{article.visibility}</span>.
            {isScheduledInFuture && (
              <span> (Scheduled to go live on {new Date(article.scheduled_for!).toLocaleString()})</span>
            )}
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl md:text-5xl leading-tight break-words">
          {article.title}
        </h1>

        {/* Meta info */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-t border-zinc-100 py-4 text-sm">
          <div className="flex items-center gap-2">
            {authorProfile?.avatar_url ? (
              <div className="relative h-8 w-8 overflow-hidden rounded-full">
                <Image
                  src={authorProfile.avatar_url}
                  alt={authorName}
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
            ) : (
              <LocalBrandedPlaceholder
                variant="avatar"
                title={authorName}
                initials={authorName.slice(0, 2).toUpperCase()}
                className="h-8 w-8 rounded-full from-orange-600 to-orange-600 text-xs"
              />
            )}
            <span className="font-bold text-zinc-700">{authorName}</span>
          </div>

          <div className="flex items-center gap-4 text-zinc-500 font-semibold">
            <span>{displayDate}</span>
            {article.reading_time && (
              <>
                <span>•</span>
                <span>{article.reading_time} min read</span>
              </>
            )}
          </div>
        </div>

        {/* Cover Image */}
        <div className="relative mt-8 h-64 sm:h-[400px] w-full overflow-hidden rounded-2xl bg-zinc-100">
          <Image
            src={imageSrc}
            alt={article.title}
            fill
            priority
            unoptimized
            className="object-cover"
          />
        </div>

        {/* Body content */}
        <div
          className="tiptap-editor mt-8 text-base sm:text-lg leading-8 text-zinc-800 break-words space-y-4"
          dangerouslySetInnerHTML={{ __html: article.body }}
        />

        {/* Categories & Tags */}
        <div className="mt-12 border-t border-zinc-100 pt-8 space-y-4">
          {article.categories && article.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 mr-2">
                Categories:
              </span>
              {article.categories.map((cat: string) => (
                <Link
                  key={cat}
                  href={`/articles/category/${encodeURIComponent(cat.toLowerCase())}`}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 hover:bg-orange-100 transition"
                >
                  {cat}
                </Link>
              ))}
            </div>
          )}

          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 mr-2">
                Tags:
              </span>
              {article.tags.map((tag: string) => (
                <Link
                  key={tag}
                  href={`/articles/tag/${encodeURIComponent(tag.toLowerCase())}`}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-600 hover:bg-orange-50 hover:text-orange-600 transition"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
