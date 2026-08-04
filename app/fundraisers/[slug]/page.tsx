import type { Metadata } from "next";

import DonationProtectedBadge from "@/components/DonationProtectedBadge";
import SupportMessages from "@/components/SupportMessages";
import FundraiserMediaSlider, {
  type FundraiserMediaSlide,
} from "@/components/FundraiserMediaSlider";
import FundraiserShare from "@/components/FundraiserShare";
import FundraiserStory from "@/components/FundraiserStory";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { BRAND } from "@/config/branding";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { recordDonationFromStripeSessionId } from "@/lib/donations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Zap, HeartHandshake, ShieldCheck } from "lucide-react";
import FundraiserFloatingActions, { ShareFundraiserButton } from "./FundraiserActions";
import StarRating from "@/components/StarRating";
import { normalizeImageUrl } from "@/lib/image-url";
import { jsonLdScriptValue } from "@/lib/structured-data";
import { money } from "@/lib/format";
import DonorList from "@/components/DonorList";
import RelatedFundraiserCarousel from "@/components/RelatedFundraiserCarousel";
import {
  FUNDRAISER_FALLBACK_IMAGE,
  getFundraiserBySlug,
  getOptionalFundraiserFields,
  getRelatedFundraisers,
} from "@/lib/fundraiser-data";
import { getSiteUrl } from "@/lib/site-url";
import { truncateWords, stripHtml } from "@/lib/text";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const fundraiser = await getFundraiserBySlug(slug);

  const title = fundraiser?.title
    ? `${fundraiser.title} — Aldriva`
    : "Fundraiser — Aldriva";
  const raised = `$${Number(fundraiser?.raised ?? 0).toLocaleString()}`;
  const goal = `$${Number(fundraiser?.goal ?? 0).toLocaleString()}`;
  const description =
    fundraiser?.story ||
    `${raised} raised of ${goal} goal. Support this fundraiser on Aldriva.`;
  // Use the auto-generated live-data campaign card (opengraph-image.tsx),
  // same as the hero-carousel share-card slide and FundraiserShare's
  // preview — not the raw banner photo, so social previews always show
  // current raised/goal/percentage rather than just the cover image.
  const image = fundraiser
    ? `${getSiteUrl()}/fundraisers/${fundraiser.slug}/opengraph-image`
    : normalizeImageUrl(null, "/og-image.png");

  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    alternates: {
      canonical: `${getSiteUrl()}/fundraisers/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${getSiteUrl()}/fundraisers/${slug}`,
      siteName: "Aldriva",
      images: [{ url: image, width: 1200, height: 630, alt: fundraiser?.title || "Fundraiser" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

const FALLBACK_IMAGE = FUNDRAISER_FALLBACK_IMAGE;

type DonationRow = {
  id: string;
  donor_name: string | null;
  amount: number | string | null;
  created_at: string;
  user_id: string | null;
};

type UpdateRow = {
  id: string;
  organizer_id: string | null;
  title: string | null;
  content: string;
  created_at: string;
};

type MediaRow = {
  id: string | null;
  url: string;
  type: string | null;
};

type OrganizerRow = {
  id: string;
  name: string | null;
};

type PublicProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

function initial(value: string) {
  return (value.trim() || "A").charAt(0).toUpperCase();
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(value: string) {
  const days = Math.floor(
    (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function createdAgo(value: string) {
  const secs = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

async function getPublicProfileMap(
  userIds: string[],
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>
): Promise<Map<string, PublicProfileRow>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data } = await supabaseAdmin
    .from("public_profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);

  return new Map(
    ((data ?? []) as PublicProfileRow[]).map((profile) => [profile.id, profile])
  );
}

function OrganizerAvatar({ name }: { name: string }) {
  return (
    <LocalBrandedPlaceholder
      variant="avatar"
      title={name}
      initials={initial(name)}
      className="h-11 w-11 shrink-0 from-transparent to-transparent text-sm text-zinc-700"
    />
  );
}

import ProgressRing from "@/components/ui/ProgressRing";


export default async function FundraiserPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ success?: string; session_id?: string }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};

  if (query.success === "true" && query.session_id) {
    try {
      await recordDonationFromStripeSessionId(query.session_id);
    } catch (error) {
      console.error("Failed to record Stripe donation session:", error);
    }
  }

  const supabaseAdmin = createSupabaseAdmin();

  // Fetch via the service-role client so an owner/admin can preview a
  // non-published campaign (the anon server client would be RLS-blocked from
  // pending_review/rejected rows). Public visibility is enforced in code below.
  const { data: fundraiser } = await supabaseAdmin
    .from("fundraisers")
    .select(
      "id, title, slug, banner, image_url, goal, raised, raised_amount, organizer_id, organizer, story, category, created_at, review_count, average_rating, user_id, status, rejection_reason"
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!fundraiser) return notFound();

  // Visibility gate: 'published' is public; 'pending_review'/'rejected' are
  // visible only to the owner (by user_id or an owned organizer) or an admin.
  if (fundraiser.status !== "published") {
    const viewer = await getCurrentUser();
    let canView = false;
    if (viewer) {
      if (viewer.id === fundraiser.user_id || (await isAdmin())) {
        canView = true;
      } else if (fundraiser.organizer_id) {
        const { data: ownedOrganizer } = await supabaseAdmin
          .from("organizers")
          .select("id")
          .eq("id", fundraiser.organizer_id)
          .eq("user_id", viewer.id)
          .maybeSingle();
        canView = Boolean(ownedOrganizer);
      }
    }
    if (!canView) return notFound();
  }

  const optionalFundraiser = await getOptionalFundraiserFields(fundraiser.id);

  const [
    mediaResult,
    updatesResult,
    donationsResult,
    organizerResult,
    commentsResult,
    relatedFundraisers,
  ] = await Promise.all([
    supabase
      .from("fundraiser_media")
      .select("id, url, type, position")
      .eq("fundraiser_id", fundraiser.id)
      .order("position", { ascending: true }),
    supabase
      .from("fundraiser_updates")
      .select("id, organizer_id, title, content, created_at")
      .eq("fundraiser_id", fundraiser.id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("donations")
      .select("id, donor_name, amount, created_at, user_id", {
        count: "exact",
      })
      .eq("fundraiser_id", fundraiser.id)
      .in("status", ["succeeded", "completed"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(5),
    fundraiser.organizer_id
      ? supabase
          .from("organizers")
          .select("id, name")
          .eq("id", fundraiser.organizer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "fundraiser")
      .eq("target_id", fundraiser.id)
      .eq("status", "approved"),
    getRelatedFundraisers(fundraiser.id, 10),
  ]);

  const organizer = organizerResult.data as OrganizerRow | null;
  const organizerName =
    organizer?.name || fundraiser.organizer || "Campaign organizer";

  // If no organizer_id was stored, try to resolve the organizer profile by
  // matching the organizer name — same fallback pattern used for the beneficiary.
  const { data: organizerByName } =
    !organizer && organizerName && organizerName !== "Campaign organizer"
      ? await supabase
          .from("organizers")
          .select("id")
          .eq("name", organizerName)
          .eq("visibility", "public")
          .not("status", "in", "(rejected,suspended)")
          .maybeSingle()
      : { data: null };

  // Single source-of-truth for the organizer profile link
  const organizerProfileId: string | null =
    organizer?.id ?? organizerByName?.id ?? null;

  const raised = Number(fundraiser.raised ?? 0);
  const goal = Number(optionalFundraiser.goal_amount ?? fundraiser.goal ?? 0);
  const coverImage = normalizeImageUrl(
    fundraiser.image_url || fundraiser.banner,
    FALLBACK_IMAGE
  );
  const mediaRows = (mediaResult.data ?? []) as MediaRow[];
  const media: FundraiserMediaSlide[] = [];

  // Slide 1: Plain cover photo (hero banner)
  media.push({
    id: "cover-image",
    url: coverImage,
    type: "image",
  });

  // Slide 2: Consolidated Share slide
  media.push({
    id: "share-card",
    type: "component",
    component: (
      <FundraiserShare
        title={fundraiser.title}
        imageUrl={coverImage}
        organizerName={organizerName}
        raised={raised}
        goal={goal}
        donateSlug={fundraiser.slug}
        hideButtons={true}
      />
    ),
  });

  // Gallery images (if any)
  if (mediaRows.length > 0) {
    media.push(
      ...mediaRows.map((item) => ({
        id: item.id,
        url: item.url,
        type: item.type,
      }))
    );
  }
  const updates = (updatesResult.data ?? []) as UpdateRow[];
  const recentDonors = (donationsResult.data ?? []) as DonationRow[];
  const publicProfileById = await getPublicProfileMap(
    recentDonors
      .map((donation) => donation.user_id)
      .filter((id): id is string => Boolean(id)),
    supabaseAdmin
  );
  const donationCount = donationsResult.count ?? recentDonors.length;
  const percentage =
    goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  const description =
    optionalFundraiser.description ||
    fundraiser.story ||
    optionalFundraiser.short_description ||
    "";
  void commentsResult.count;

  // Story-overlay slide: excerpt + donor cluster, reusing the same donor
  // display-name resolution DonorList uses (profile display name, then the
  // raw donor_name, then Anonymous) — no new query, just the data already
  // fetched above for the sidebar donor list.
  const donorDisplayNames = recentDonors.map(
    (donation) =>
      (donation.user_id && publicProfileById.get(donation.user_id)?.display_name) ||
      donation.donor_name ||
      "Anonymous"
  );
  const storyExcerpt = truncateWords(
    stripHtml(optionalFundraiser.short_description || description) ||
      "Read the full story.",
    160
  );

  media.push({
    id: "story-overlay",
    // No photo — this slide renders a solid brand-color backdrop instead.
    url: null,
    type: "image",
    story: {
      excerpt: storyExcerpt,
      donorCount: donationCount,
      donorNames: donorDisplayNames,
      scrollTargetId: "fundraiser-story",
    },
  });
  const beneficiaryName: string =
    optionalFundraiser.beneficiary ||
    optionalFundraiser.beneficiary_name ||
    fundraiser.title ||
    "This Cause";

  const { data: beneficiaryOrganizer } = beneficiaryName
    ? await supabase
        .from("organizers")
        .select("id")
        .eq("name", beneficiaryName)
        .eq("visibility", "public")
        .not("status", "in", "(rejected,suspended)")
        .maybeSingle()
    : { data: null };

  const fundraiserCategory: string = fundraiser.category || "";
  const fundraiserCreatedAt: string =
    fundraiser.created_at || new Date().toISOString();

  // ── JSON-LD structured data (Fundraiser / DonateAction) ────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DonateAction",
    name: fundraiser.title,
    description: description || undefined,
    image: coverImage !== FALLBACK_IMAGE ? coverImage : undefined,
    url: `${getSiteUrl()}/fundraisers/${slug}`,
    recipient: {
      "@type": "Organization",
      name: organizerName,
      ...(organizerProfileId
        ? { url: `${getSiteUrl()}/organizers/${organizerProfileId}` }
        : {}),
    },
    object: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: goal,
    },
    actionStatus: percentage >= 100
      ? "https://schema.org/CompletedActionStatus"
      : "https://schema.org/ActiveActionStatus",
  };

  return (
    <main className="min-h-screen bg-white pb-24 text-zinc-950 lg:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptValue(jsonLd) }}
      />
      {fundraiser.status !== "published" && (
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              fundraiser.status === "rejected"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {fundraiser.status === "rejected"
              ? `This campaign was rejected${
                  fundraiser.rejection_reason
                    ? `: ${fundraiser.rejection_reason.trim().replace(/\.+$/, "")}`
                    : ""
                }. It is not visible to the public.`
              : "This campaign is pending admin review and isn’t visible to the public yet — you can see it because you have access to it."}
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:py-10">
        {/* Main content column — `contents` below `lg` dissolves this div's own
            box so its children become direct items of the outer grid above,
            letting each one carry its own `order-*` value (see below) that
            interleaves with the aside. DOM order is untouched — `contents`
            only affects the box/layout tree, not the DOM or accessibility
            tree — so this is a visual-only reorder, same as the `order-first`
            trick it replaces. At `lg` the div becomes a normal box again,
            restoring today's two-column sidebar layout unchanged. */}
        <div className="contents lg:block lg:min-w-0 lg:space-y-8 lg:col-span-2">
          <header className="order-4 lg:order-none">
            {fundraiserCategory && (
              <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700 mb-3">
                {fundraiserCategory}
              </span>
            )}
            <h1 className="text-3xl font-bold leading-tight text-zinc-950 sm:text-4xl break-words">
              {fundraiser.title}
            </h1>
            {fundraiser.review_count > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-zinc-600">
                <StarRating value={fundraiser.average_rating} size={16} />
                <span className="font-bold text-zinc-800">
                  {Number(fundraiser.average_rating).toFixed(1)}
                </span>
                <span>
                  ({fundraiser.review_count} {fundraiser.review_count === 1 ? "review" : "reviews"})
                </span>
              </div>
            )}
          </header>

          <section className="order-1 border-b border-zinc-200 pb-8 lg:order-none">
            <FundraiserMediaSlider media={media} title={fundraiser.title} />
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <OrganizerAvatar name={organizerName} />
                <p className="text-sm text-zinc-600 break-words">
                  Organised by{" "}
                  {organizerProfileId ? (
                    <Link
                      href={`/organizers/${organizerProfileId}`}
                      className="font-bold text-zinc-950 hover:text-emerald-600 hover:underline transition"
                    >
                      {organizerName}
                    </Link>
                  ) : (
                    <span className="font-bold text-zinc-950">
                      {organizerName}
                    </span>
                  )}
                </p>
              </div>
              <DonationProtectedBadge />
            </div>
          </section>

          <div className="order-3 lg:order-none">
            <FundraiserStory description={description} />
          </div>

          {updates.length > 0 && (
            <section className="order-6 border-b border-zinc-200 pb-8 lg:order-none">
              <h2 className="text-2xl font-bold text-zinc-950 break-words">
                Updates {updates.length}
              </h2>
              <div className="mt-5 space-y-5">
                {updates.map((update) => (
                  <article
                    key={update.id}
                    className="rounded-lg border border-zinc-200 p-5"
                  >
                    <div className="flex gap-3">
                      <OrganizerAvatar name={organizerName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-bold text-zinc-950">
                            {organizerName}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
                            Organiser
                          </span>
                          <span className="text-zinc-500">
                            {dateLabel(update.created_at)}
                          </span>
                        </div>
                        {update.title && (
                          <h3 className="mt-3 text-lg font-bold text-zinc-950 break-words">
                            {update.title}
                          </h3>
                        )}
                        <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-zinc-700">
                          {update.content}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="order-7 lg:order-none">
            <FundraiserShare
              title={fundraiser.title}
              imageUrl={coverImage}
              organizerName={organizerName}
              raised={raised}
              goal={goal}
              donateSlug={fundraiser.slug}
            />
          </div>

          {/* ── Organiser & Beneficiary ─────────────────────────── */}
          <section className="order-5 border-t border-zinc-200 pt-8 lg:order-none">
            <h2 className="text-lg font-black text-zinc-950 break-words">
              Organiser and beneficiary
            </h2>
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={organizerName}
                  initials={initial(organizerName)}
                  className="h-11 w-11 shrink-0 from-transparent to-transparent text-sm text-zinc-700"
                />
                <div className="min-w-0">
                  {organizerProfileId ? (
                    <Link
                      href={`/organizers/${organizerProfileId}`}
                      className="block truncate text-sm font-black text-zinc-950 hover:text-emerald-600 hover:underline transition"
                    >
                      {organizerName}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-black text-zinc-950">
                      {organizerName}
                    </span>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
                      Organiser
                    </span>
                    {organizerProfileId && (
                      <a
                        href={`mailto:${BRAND.supportEmail}?subject=Message%20for%20${encodeURIComponent(organizerName)}`}
                        className="rounded-full border border-zinc-300 px-3 py-0.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Message
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0 text-zinc-400 rotate-90 sm:rotate-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>

              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={beneficiaryName}
                  initials={initial(beneficiaryName)}
                  className="h-11 w-11 shrink-0 from-transparent to-transparent text-sm text-emerald-700"
                />
                <div className="min-w-0">
                  {beneficiaryOrganizer?.id ? (
                    <Link
                      href={`/organizers/${beneficiaryOrganizer.id}`}
                      className="block truncate text-sm font-black text-zinc-950 hover:text-emerald-600 hover:underline transition"
                    >
                      {beneficiaryName}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-black text-zinc-950">
                      {beneficiaryName}
                    </span>
                  )}
                  <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    Beneficiary
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-zinc-400">
              Created {createdAgo(fundraiserCreatedAt)}
              {fundraiserCategory ? ` · ${fundraiserCategory}` : ""}
            </p>

            <a
              href={`mailto:${BRAND.supportEmail}?subject=Report%20fundraiser%3A%20${encodeURIComponent(fundraiser.title)}`}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-red-500"
            >
              <Flag className="h-3.5 w-3.5" />
              Report fundraiser
            </a>
          </section>

          {/* ── Words of Support — always visible ───────────────── */}
          <div className="order-8 border-t border-zinc-200 pt-8 lg:order-none">
            <SupportMessages fundraiserId={fundraiser.id} />
          </div>

        </div>

        {/* Aside — order-2 below `lg` (hero carousel first, then this
            progress/donate card, then the story — see the `contents` wrapper
            above), since the sidebar grid itself only kicks in at `lg`; DOM
            order is untouched, so SEO/accessibility order matches the
            desktop reading order at every width). */}
        <aside id="main-donation-card" className="order-2 min-w-0 lg:order-none lg:col-span-1">
          <div className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-sm lg:sticky lg:top-24">
            <section className="flex items-center gap-4">
              <div className="shrink-0">
                <ProgressRing percentage={percentage} size={72} strokeWidth={7} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-black tracking-tight text-zinc-950 leading-tight">
                  {money(raised)} raised
                </p>
                <p className="text-lg font-medium text-zinc-500 leading-snug">
                  of {money(goal)} USD
                </p>
                <p className="text-xs font-semibold text-zinc-500 mt-1">
                  {donationCount.toLocaleString()} donation{donationCount === 1 ? "" : "s"}
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <a
                href={`/fundraisers/${fundraiser.slug}/donate`}
                className="flex w-full min-h-[48px] items-center justify-center rounded-full bg-[#c0f269] px-6 py-3.5 text-base font-black text-[#1b3e10] transition hover:bg-[#b5eb57] active:scale-[0.98] shadow-sm"
              >
                Donate now
              </a>
              <ShareFundraiserButton
                title={fundraiser.title}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#1c3a27] px-6 py-3.5 text-base font-black text-[#c0f269] transition hover:bg-[#152f1e] active:scale-[0.98] shadow-sm"
              />
            </section>

            <section className="border-t border-zinc-100 pt-4 lg:pt-5">
              <h2 className="text-base font-bold text-zinc-950 mb-3">
                Recent donors
              </h2>
              <DonorList
                fundraiserId={fundraiser.id}
                initialDonations={recentDonors.map((d) => ({
                  ...d,
                  profile: d.user_id ? publicProfileById.get(d.user_id) ?? null : null,
                }))}
                initialHasMore={donationCount > recentDonors.length}
              />
            </section>
          </div>
        </aside>
      </div>

      {/* ── Trust triad ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="text-center sm:text-left">
            <Zap className="mx-auto h-8 w-8 text-emerald-600 sm:mx-0" />
            <h3 className="mt-3 text-lg font-black text-zinc-950">Easy</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Donate quickly and securely
            </p>
          </div>
          <div className="text-center sm:text-left">
            <HeartHandshake className="mx-auto h-8 w-8 text-emerald-600 sm:mx-0" />
            <h3 className="mt-3 text-lg font-black text-zinc-950">Powerful</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Send help directly to the people and causes you care about
            </p>
          </div>
          <div className="text-center sm:text-left">
            <ShieldCheck className="mx-auto h-8 w-8 text-emerald-600 sm:mx-0" />
            <h3 className="mt-3 text-lg font-black text-zinc-950">Trusted</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Every fundraiser is reviewed —{" "}
              <Link
                href="/reviews"
                className="font-bold text-emerald-700 hover:underline"
              >
                see what real donors are saying
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Related fundraisers ─────────────────────────────────────── */}
      {relatedFundraisers.length > 0 && (
        <section className="bg-emerald-950 py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Making a Difference
              </p>
              <h2 className="mt-1 text-3xl font-black text-white">
                More ways to make a difference
              </h2>
              <p className="mt-1 text-sm font-medium text-emerald-100/70">
                Other fundraisers you might want to support.
              </p>
            </div>
            <RelatedFundraiserCarousel
              fundraisers={relatedFundraisers}
              excludeId={fundraiser.id}
            />
          </div>
        </section>
      )}

      {/* Sticky bottom actions bar on mobile */}
      <FundraiserFloatingActions
        title={fundraiser.title}
        slug={fundraiser.slug}
        raised={raised}
        goal={goal}
        percentage={percentage}
        targetElementId="main-donation-card"
      />
    </main>
  );
}
