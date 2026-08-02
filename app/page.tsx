import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import EventCard from "@/components/EventCard";
import { supabase } from "@/lib/supabase";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";
import {
  HOMEPAGE_HERO_SETTING_KEYS,
  getHomepageHeroSettings,
} from "@/lib/homepage-hero";
import FeaturedSlider, { type FeaturedSliderItem } from "@/components/FeaturedSlider";
import HomepageTestimonials from "@/components/HomepageTestimonials";
import HomepageSponsors from "@/components/HomepageSponsors";
import AboutUsSection from "@/components/ui/about-us-section";
import { Gallery4, type Gallery4Item } from "@/components/ui/gallery4";
import TrustBar from "@/components/public/TrustBar";
import RuixenFeaturedImageSection from "@/components/ui/ruixen-featured-image-section";
import CategoryGrid from "@/components/CategoryGrid";
import { getCategoryChips } from "@/lib/category-chips";

const siteUrl = getSiteUrl();

// ---------------------------------------------------------------------------
// Cached data fetchers – 5-minute TTL for admin-managed content
// ---------------------------------------------------------------------------

/** Hero settings (platform_settings table). Shared by generateMetadata and page. */
const getCachedHeroSettings = unstable_cache(
  async () => {
    try {
      const supabaseAdmin = createSupabaseAdmin();
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("key, value")
        .in("key", HOMEPAGE_HERO_SETTING_KEYS);
      return getHomepageHeroSettings(data);
    } catch {
      return getHomepageHeroSettings(null);
    }
  },
  ["homepage-hero-settings"],
  { revalidate: 300 }
);

/** Testimonials + platform reviews. */
const getCachedTestimonials = unstable_cache(
  async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const [testimonialsResult, platformReviewsResult] = await Promise.all([
      supabaseAdmin
        .from("homepage_testimonials")
        .select("id, name, role, photo_url, quote, position")
        .eq("is_visible", true)
        .order("position", { ascending: true })
        .then(({ data, error }) => (error ? [] : data ?? [])),
      supabaseAdmin
        .from("reviews")
        .select("id, rating, title, review, created_at, user_id")
        .eq("review_type", "platform")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(6)
        .then(async ({ data, error }) => {
          if (error) return [];
          const userIds = Array.from(
            new Set((data ?? []).map((r) => r.user_id).filter(Boolean))
          );
          const { data: profiles } = userIds.length
            ? await supabaseAdmin
                .from("profiles")
                .select("id, display_name, avatar_url, profile_photo")
                .in("id", userIds)
            : { data: [] };
          const profileById = new Map(
            (profiles ?? []).map((profile) => [profile.id, profile])
          );

          return (data ?? []).map((r) => {
            const profile = r.user_id ? profileById.get(r.user_id) : null;
            return {
              id: r.id,
              name: profile?.display_name || "Anonymous",
              role: `Platform Reviewer (${r.rating} ★)`,
              photo_url: profile?.avatar_url || profile?.profile_photo || "",
              quote: r.title ? `"${r.title}" — ${r.review ?? ""}` : (r.review ?? ""),
              position: 0,
            };
          });
        }),
    ]);
    return [...platformReviewsResult, ...testimonialsResult].slice(0, 6);
  },
  ["homepage-testimonials"],
  { revalidate: 300 }
);

/** Sponsors. */
const getCachedSponsors = unstable_cache(
  async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("homepage_sponsors")
      .select("id, name, logo_url, website_url, position")
      .eq("is_visible", true)
      .order("position", { ascending: true });
    return error ? [] : data ?? [];
  },
  ["homepage-sponsors"],
  { revalidate: 300 }
);

/** Platform stats (event/fundraiser/organizer counts). */
const getCachedPlatformStats = unstable_cache(
  async () => {
    const [{ count: totalEvents }, { count: totalFundraisers }, { count: totalOrganizers }] =
      await Promise.all([
        supabase.from("events").select("id", { count: "exact", head: true }).eq("visibility", "public").eq("status", "approved"),
        supabase.from("fundraisers").select("id", { count: "exact", head: true }),
        supabase.from("organizers").select("id", { count: "exact", head: true }).eq("visibility", "public"),
      ]);
    return { totalEvents: totalEvents ?? 0, totalFundraisers: totalFundraisers ?? 0, totalOrganizers: totalOrganizers ?? 0 };
  },
  ["homepage-platform-stats"],
  { revalidate: 300 }
);


export async function generateMetadata(): Promise<Metadata> {
  // Reuses the same cache as the page component – no extra DB query.
  const hero = await getCachedHeroSettings();

  return {
    metadataBase: new URL(siteUrl),
    title: hero.seoTitle,
    description: hero.seoDescription,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: hero.seoTitle,
      description: hero.seoDescription,
      url: "/",
      siteName: "Aldriva",
      type: "website",
      images: [
        {
          url: hero.seoOgImageUrl,
          width: 1200,
          height: 630,
          alt: hero.seoTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: hero.seoTitle,
      description: hero.seoDescription,
      images: [hero.seoOgImageUrl],
    },
  };
}

const FUNDRAISER_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1080&auto=format&fit=crop";

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function fundraiserImage(src: string | null | undefined) {
  if (!src?.startsWith("http")) return FUNDRAISER_FALLBACK_IMAGE;
  if (src.includes("youtube.com") || src.includes("google.com/imgres")) {
    return FUNDRAISER_FALLBACK_IMAGE;
  }
  if (/\.(mp4|mov|webm)(\?|$)/i.test(src)) return FUNDRAISER_FALLBACK_IMAGE;

  return src;
}

export default async function HomePage() {
  // 1. Hero settings (5-min cache, shared with generateMetadata)
  const hero = await getCachedHeroSettings();

  // 2. Categories (5-min cache)
  const categories = await getCategoryChips();

  // 3. Featured events (live data, max 60-s page cache)
  let featuredEvents: any[] = [];
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, slug, date:event_date, location:city, image_url:banner, category")
      .eq("is_homepage_featured", true)
      .is("deleted_at", null)
      .order("homepage_position", { ascending: true })
      .limit(6);

    if (error) {
      const { data: fallback } = await supabase
        .from("events")
        .select("id, title, slug, date:event_date, location:city, image_url:banner, category")
        .eq("is_homepage_featured", true)
        .is("deleted_at", null)
        .limit(6);
      featuredEvents = fallback ?? [];
    } else {
      featuredEvents = data ?? [];
    }
  } catch (err) {
    console.error("Failed to query featured events", err);
  }

  // 4. Featured fundraisers (live data)
  let featuredFundraisers: any[] = [];
  try {
    const { data, error } = await supabase
      .from("fundraisers")
      .select("id, title, slug, goal_amount:goal, raised_amount:raised, image_url:banner, category")
      .eq("is_homepage_featured", true)
      .is("deleted_at", null)
      .order("homepage_position", { ascending: true })
      .limit(6);

    if (error) {
      const { data: fallback } = await supabase
        .from("fundraisers")
        .select("id, title, slug, goal_amount:goal, raised_amount:raised, image_url:banner, category")
        .eq("is_homepage_featured", true)
        .is("deleted_at", null)
        .limit(6);
      featuredFundraisers = fallback ?? [];
    } else {
      featuredFundraisers = data ?? [];
    }
  } catch (err) {
    console.error("Failed to query featured fundraisers", err);
  }

  // 5. Fallbacks for slider + cached admin data + below-fold data — all in parallel
  const [
    featuredSliderEvents,
    featuredSliderFundraisers,
    combinedTestimonials,
    sponsorsResult,
    { totalEvents, totalFundraisers, totalOrganizers },
    rawEventsResult,
    fundraisersResult,
  ] = await Promise.all([
    featuredEvents.length >= 2
      ? Promise.resolve(featuredEvents)
      : supabase
          .from("events")
          .select("id, title, slug, date:event_date, location:city, image_url:banner, category")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5)
          .then(({ data }) => data ?? []),
    featuredFundraisers.length >= 2
      ? Promise.resolve(featuredFundraisers)
      : supabase
          .from("fundraisers")
          .select("id, title, slug, goal_amount:goal, raised_amount:raised, image_url:banner, category")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5)
          .then(({ data }) => data ?? []),
    // Admin data — served from 5-min cache
    getCachedTestimonials(),
    getCachedSponsors(),
    getCachedPlatformStats(),
    // Below-fold data fetching
    supabase
      .from("events")
      .select("id, title, slug, event_date, city, venue, banner, visibility, status")
      .eq("visibility", "public")
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => data ?? []),
    supabase
      .from("fundraisers")
      .select("id, title, slug, goal, raised, banner, category")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => data ?? []),
  ]);

  // Combine featured events + fundraisers for the FeaturedSlider component
  const combinedFeaturedItems: FeaturedSliderItem[] = [
    ...featuredSliderEvents.map((e: any) => ({
      type: "event" as const,
      id: e.id,
      title: e.title,
      slug: e.slug,
      date: e.date,
      location: e.location,
      image_url: e.image_url,
      category: e.category,
    })),
    ...featuredSliderFundraisers.map((f: any) => ({
      type: "fundraiser" as const,
      id: f.id,
      title: f.title,
      slug: f.slug,
      goal_amount: f.goal_amount,
      raised_amount: f.raised_amount,
      image_url: f.image_url,
    })),
  ];

  const trustStats = [
    { label: "Live events", value: `${totalEvents}+` },
    { label: "Active campaigns", value: `${totalFundraisers}+` },
    { label: "Organizations", value: `${totalOrganizers}+` },
    { label: "Secure checkout", value: "Stripe" },
  ];

  // Deduplicate events grid
  const seen = new Set<string>();
  const events = rawEventsResult
    .filter((ev) => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; })
    .slice(0, 6);

  const fundraiserGalleryItems: Gallery4Item[] = fundraisersResult.map((fundraiser) => ({
    id: fundraiser.id,
    title: fundraiser.title,
    description: `${money(fundraiser.raised)} raised of ${money(fundraiser.goal)} goal`,
    href: `/fundraisers/${fundraiser.slug}`,
    image: fundraiserImage(fundraiser.banner),
    cta: "Donate Now",
  }));


  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="bg-white px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
        <div
          className="relative mx-auto flex aspect-[4/3] max-w-7xl items-end overflow-hidden rounded-xl bg-cover bg-center px-4 py-6 sm:aspect-[16/7] sm:items-center sm:rounded-sm sm:px-12 sm:py-16 lg:aspect-[16/5] lg:rounded-b-lg lg:px-20"
          style={{
            backgroundImage: `url("${hero.imageUrl.replaceAll('"', "")}")`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10 sm:from-black/85 sm:via-black/48 sm:to-black/15" />
          <div className="relative w-full max-w-full sm:max-w-3xl">
            <p className="text-xs font-black uppercase tracking-wide text-white drop-shadow sm:text-sm">
              {hero.subtitle}
            </p>
            <h1 className="mt-2 max-w-full text-2xl font-black leading-[1.1] tracking-tight text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)] sm:mt-3 sm:text-4xl md:text-5xl lg:text-6xl">
              {hero.title}
              {hero.headlineLine2 && (
                <>
                  <br />
                  <span className="text-violet-300">{hero.headlineLine2}</span>
                </>
              )}
            </h1>
            <div className="relative z-10 mt-4 flex flex-wrap gap-3 sm:mt-6">
              <Link
                href={hero.buttonHref}
                className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-orange-50 sm:px-7 sm:py-3 sm:text-base shadow-lg shadow-black/20"
              >
                {hero.buttonText}
              </Link>
              {hero.secondaryButtonText && hero.secondaryButtonHref && (
                <Link
                  href={hero.secondaryButtonHref}
                  className="inline-flex rounded-full border border-white/80 bg-white/10 px-5 py-2.5 text-sm font-black text-white backdrop-blur transition hover:bg-white/20 sm:px-7 sm:py-3 sm:text-base"
                >
                  {hero.secondaryButtonText}
                </Link>
              )}
            </div>
          </div>
        </div>

        <CategoryGrid categories={categories} />
      </section>

      <TrustBar stats={trustStats} />

      <section className="bg-white py-7 sm:py-10">
        <div className="mx-auto mb-3 flex max-w-7xl items-center justify-between px-3 sm:mb-5 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-widest text-orange-600 sm:text-xs">
            Featured This Week
          </p>
        </div>
        <FeaturedSlider items={combinedFeaturedItems} />
      </section>

      <HomepageTestimonials testimonials={combinedTestimonials} />

      {/* ── TASK 1 — Events grid (deduplicated, max 6) ─────────────────────────── */}
      <section className="mx-auto max-w-7xl bg-white px-3 py-8 sm:px-6 sm:py-16 lg:px-8">
        <div className="mb-5 flex flex-col justify-between gap-2 sm:mb-8 sm:flex-row sm:items-end sm:gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-orange-600 sm:text-sm">Events</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 sm:mt-2 sm:text-4xl">Discover events</h2>
          </div>
          <Link href="/events" className="text-xs font-black text-orange-600 hover:text-orange-700 sm:text-sm">
            View all events →
          </Link>
        </div>

        {events.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {events.map((event) => (
              <EventCard
                key={event.id}
                slug={event.slug}
                title={event.title}
                date={
                  event.event_date
                    ? new Date(event.event_date).toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })
                    : "Date TBA"
                }
                eventDate={event.event_date}
                location={event.city || event.venue || "Location TBA"}
                image={
                  event.banner ||
                  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop"
                }
                variant="homepage"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
            <h3 className="text-2xl font-black">No events yet.</h3>
            <Link href="/create-event" className="mt-4 inline-block rounded-xl bg-orange-600 px-5 py-3 font-black text-white">
              Create the first event
            </Link>
          </div>
        )}
      </section>

      <Gallery4
        eyebrow="Fundraising"
        title="Crowdfunding for causes, communities, and events."
        description="Campaigns can tell a story, show progress, collect donations, and keep supporters engaged."
        items={fundraiserGalleryItems}
      />

      <RuixenFeaturedImageSection />

      <HomepageSponsors sponsors={sponsorsResult} />

      {/* ── About Us section ──────────────────────────────────────────────────── */}
      <AboutUsSection />

    </main>
  );
}
