import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { compactJsonLd, jsonLdScriptValue } from "@/lib/structured-data";
import ArticleCard from "@/components/ArticleCard";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export const dynamic = "force-dynamic";

async function fetchAndGateBusiness(slug: string) {
  const adminClient = createSupabaseAdmin();
  const supabaseServer = await createSupabaseServer();

  // Fetch business details
  const { data: business } = await adminClient
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!business) {
    // Return null sentinel — notFound() is called by the page component directly.
    return null;
  }

  // Fetch owner's profile separately to prevent broken joins on owner_id
  const { data: ownerProfile } = await adminClient
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", business.owner_id)
    .maybeSingle();

  // Get current logged-in user
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  let isAuthorized = false;
  if (user) {
    if (user.id === business.owner_id) {
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

  const isRestricted = business.status !== "active";
  const isFlagged = business.is_flagged === true;

  // Fetch related articles by this business
  const { data: articles } = await adminClient
    .from("articles")
    .select("*")
    .eq("business_id", business.id)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false });

  // Return gate flags — notFound() is called by the page component directly
  // so Next.js RSC propagates the 404 correctly without being swallowed by
  // React's request deduplication or a try/catch in generateMetadata.
  return { business, ownerProfile, user, isAuthorized, isRestricted, isFlagged, articles: articles || [] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Use a direct admin lookup — intentionally never calls notFound() here.
  // All access-control gating happens exclusively in BusinessDetailPage below.
  const adminClient = createSupabaseAdmin();
  const { data: business } = await adminClient
    .from("businesses")
    .select("name, slug, description, seo_title, seo_description, logo")
    .eq("slug", slug)
    .maybeSingle();

  if (!business) {
    return { title: "Business Details — Aldriva" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fund4agoodcause.com";
  return {
    title: `${business.name} — Aldriva Directory`,
    description: business.seo_description || business.description.slice(0, 160),
    alternates: {
      canonical: `${siteUrl}/businesses/${business.slug}`,
    },
    openGraph: {
      title: business.seo_title || `${business.name} — Aldriva Directory`,
      description: business.seo_description || business.description.slice(0, 160),
      url: `${siteUrl}/businesses/${business.slug}`,
      images: business.logo ? [{ url: business.logo }] : [],
    },
  };
}

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await fetchAndGateBusiness(slug);

  // No business found, or gate flags indicate restricted/flagged for this user.
  // Note: real HTTP 404 is enforced by proxy.ts (checkBusinessAccess) before
  // streaming begins. This is a secondary defence for edge cases.
  if (!result || ((result.isRestricted || result.isFlagged) && !result.isAuthorized)) {
    notFound();
  }

  const { business, ownerProfile, isAuthorized, isRestricted, isFlagged, articles } = result;

  const authorName = ownerProfile?.display_name || "Community Partner";
  const logoSrc = business.logo || "";

  // Generate LocalBusiness JSON-LD
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fund4agoodcause.com";
  const jsonLd = compactJsonLd({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
    description: business.description,
    image: logoSrc || undefined,
    telephone: business.phone || undefined,
    email: business.email || undefined,
    url: business.website || `${siteUrl}/businesses/${business.slug}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: business.address || undefined,
      addressLocality: business.city || undefined,
      addressRegion: business.state || undefined,
      addressCountry: business.country || undefined,
    },
  });

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptValue(jsonLd) }}
        />
      )}

      <main className="mx-auto max-w-[1000px] px-4 py-8 md:px-6 md:py-12 space-y-8">
        {/* Back Link */}
        <Link
          href="/businesses"
          className="inline-flex items-center text-sm font-bold text-zinc-500 hover:text-orange-600 transition"
        >
          ← Back to directory
        </Link>

        {/* Warning Banner */}
        {isAuthorized && (isRestricted || isFlagged) && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 text-sm font-semibold text-orange-800">
            <span className="font-bold">Preview Mode:</span> You are viewing this business listing as the owner/admin.
            {isRestricted && (
              <span> The status is currently <span className="underline font-bold">{business.status}</span>.</span>
            )}
            {isFlagged && (
              <span> This business has been <span className="underline font-bold text-red-600">flagged</span> and is hidden from the public.</span>
            )}
          </div>
        )}

        {/* Business Hero */}
        <div className="flex flex-col md:flex-row gap-6 items-start justify-between border-b border-zinc-100 pb-8">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={business.name}
                className="h-20 w-20 rounded-2xl object-cover border border-zinc-150 shadow-sm"
              />
            ) : (
              <LocalBrandedPlaceholder
                variant="business"
                title={business.name}
                initials={business.name.slice(0, 2).toUpperCase()}
                className="h-20 w-20 rounded-2xl border border-zinc-200 from-zinc-100 to-zinc-100 text-3xl text-zinc-500 shadow-sm"
              />
            )}
            <div>
              <span className="inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-black text-orange-700">
                {business.industry}
              </span>
              <h1 className="text-3xl font-black text-zinc-950 mt-1 break-words">{business.name}</h1>
              <p className="text-sm font-bold text-zinc-400 mt-0.5">Category: {business.category}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {business.website && (
              <a
                href={business.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 md:flex-none inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-800 transition"
              >
                Visit Website ↗
              </a>
            )}
            {isAuthorized && (
              <Link
                href={`/dashboard/businesses/${business.id}/edit`}
                className="flex-1 md:flex-none inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-center text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
              >
                Edit Listing
              </Link>
            )}
          </div>
        </div>

        {/* Content details split */}
        <div className="grid gap-8 md:grid-cols-3">
          {/* Main About */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-xl font-black text-zinc-950">About Business</h2>
            <p className="text-zinc-700 font-semibold leading-relaxed whitespace-pre-line text-base sm:text-lg">
              {business.description}
            </p>
          </div>

          {/* Sidebar Contacts */}
          <div className="md:col-span-1 rounded-2xl border border-zinc-150 bg-white p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 border-b border-zinc-100 pb-2">
              Contact &amp; Location
            </h3>

            {business.email && (
              <div>
                <span className="block text-xs font-bold text-zinc-400 uppercase">Email</span>
                <a href={`mailto:${business.email}`} className="text-sm font-bold text-orange-600 hover:underline">
                  {business.email}
                </a>
              </div>
            )}

            {business.phone && (
              <div>
                <span className="block text-xs font-bold text-zinc-400 uppercase">Phone</span>
                <span className="text-sm font-bold text-zinc-700">{business.phone}</span>
              </div>
            )}

            {business.address && (
              <div>
                <span className="block text-xs font-bold text-zinc-400 uppercase">Address</span>
                <span className="text-sm font-bold text-zinc-700 block">{business.address}</span>
                <span className="text-sm font-bold text-zinc-700">
                  {business.city ? `${business.city}, ` : ""}
                  {business.state ? `${business.state} ` : ""}
                  {business.country || ""}
                </span>
              </div>
            )}

            <div>
              <span className="block text-xs font-bold text-zinc-400 uppercase">Owner</span>
              <span className="text-sm font-bold text-zinc-700">{authorName}</span>
            </div>
          </div>
        </div>

        {/* Related Articles */}
        {articles.length > 0 && (
          <div className="border-t border-zinc-100 pt-8 space-y-6">
            <div>
              <h2 className="text-xl font-black text-zinc-950">Press Releases &amp; Articles</h2>
              <p className="text-sm font-semibold text-zinc-400">News and publications from {business.name}.</p>
            </div>
            
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
          </div>
        )}
      </main>
    </>
  );
}
