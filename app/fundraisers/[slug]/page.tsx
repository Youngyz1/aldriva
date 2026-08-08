import type { Metadata } from "next";

import DonationProtectedBadge from "@/components/DonationProtectedBadge";
import SupportMessages from "@/components/SupportMessages";
import FundraiserMediaSlider, {
  type FundraiserMediaSlide,
} from "@/components/FundraiserMediaSlider";
import FundraiserShare from "@/components/FundraiserShare";
import FundraiserStory from "@/components/FundraiserStory";
import ProgressRing from "@/components/ui/ProgressRing";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { recordDonationFromStripeSessionId } from "@/lib/donations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Zap, HeartHandshake, ShieldCheck } from "lucide-react";
import FundraiserFloatingActions, { ShareFundraiserButton } from "./FundraiserActions";
import StarRating from "@/components/StarRating";
import { safeImageSrc, normalizeImageUrl } from "@/lib/image-url";
import { jsonLdScriptValue } from "@/lib/structured-data";
import { money } from "@/lib/format";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import DonorList from "@/components/DonorList";
import RelatedFundraiserCarousel from "@/components/RelatedFundraiserCarousel";
import {
  getFundraiserBySlug,
  getOptionalFundraiserFields,
  getRelatedFundraisers,
} from "@/lib/fundraiser-data";
import {
  resolveBeneficiary,
  beneficiaryForLabel,
  beneficiaryTypeLabel,
} from "@/lib/beneficiary";
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
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: fundraiser?.title || "Fundraiser" }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}



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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center text-sm font-black text-zinc-700">
      {initial(name)}
    </div>
  );
}

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

  // Batch 1: every query that only depends on fundraiser.id (nothing here
  // depends on another query's result) — was previously optionalFundraiser
  // awaited alone before this Promise.all, costing an extra round-trip.
  const [
    optionalFundraiser,
    mediaResult,
    updatesResult,
    donationsResult,
    organizerResult,
    commentsResult,
    relatedFundraisers,
  ] = await Promise.all([
    getOptionalFundraiserFields(fundraiser.id),
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
  const recentDonors = (donationsResult.data ?? []) as DonationRow[];
  // Computed early (was previously computed just before use, much later)
  // so its lookup query can join Batch 2 below instead of running alone.
  // Was falling through to `fundraiser.title` whenever no beneficiary was
  // stored — which, since the column never existed, meant every campaign
  // showed its own title as the beneficiary. Now reads the real object,
  // defaulting to a self-beneficiary named after the organizer.
  const beneficiary = resolveBeneficiary(
    optionalFundraiser.beneficiary,
    organizerName
  );
  const beneficiaryName: string = beneficiary?.name || organizerName;

  // Batch 2: three lookups that each depend on Batch 1's results, but not on
  // each other — previously run as three separate sequential awaits.
  const [
    { data: organizerByName },
    publicProfileById,
    { data: beneficiaryOrganizer },
  ] = await Promise.all([
    // If no organizer_id was stored, try to resolve the organizer profile by
    // matching the organizer name — same fallback pattern used for the beneficiary.
    !organizer && organizerName && organizerName !== "Campaign organizer"
      ? supabase
          .from("organizers")
          .select("id")
          .eq("name", organizerName)
          .eq("visibility", "public")
          .not("status", "in", "(rejected,suspended)")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getPublicProfileMap(
      recentDonors
        .map((donation) => donation.user_id)
        .filter((id): id is string => Boolean(id)),
      supabaseAdmin
    ),
    beneficiaryName
      ? supabase
          .from("organizers")
          .select("id")
          .eq("name", beneficiaryName)
          .eq("visibility", "public")
          .not("status", "in", "(rejected,suspended)")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Single source-of-truth for the organizer profile link
  const organizerProfileId: string | null =
    organizer?.id ?? organizerByName?.id ?? null;

  const raised = Number(fundraiser.raised ?? 0);
  // `goal` is the real column; there is no `goal_amount` on fundraisers.
  const goal = Number(fundraiser.goal ?? 0);
  const coverImage = safeImageSrc(
    fundraiser.image_url || fundraiser.banner
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
        variant="hero"
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
  const donationCount = donationsResult.count ?? recentDonors.length;
  const percentage = calculateFundraisingPercentage(raised, goal);
  // `story` is the real column; there is no `description`/`short_description`.
  const description = fundraiser.story || "";
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
    stripHtml(description) || "Read the full story.",
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

  const fundraiserCategory: string = fundraiser.category || "";
  const fundraiserCreatedAt: string =
    fundraiser.created_at || new Date().toISOString();

  // ── JSON-LD structured data (Fundraiser / DonateAction) ────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DonateAction",
    name: fundraiser.title,
    description: description || undefined,
    image: coverImage || undefined,
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
    <main className="min-h-screen bg-white pb-40 text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptValue(jsonLd) }}
      />
      {fundraiser.status !== "published" && (
        <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
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
      {/* Hero — full-bleed on mobile (touches the screen edges for maximum
          emotional impact), inset within the reading column at sm+ with a
          soft rounded treatment. Ends naturally — no overlapping card, no
          negative margin into the content below; the fundraising section
          simply begins in normal flow immediately after. */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="-mx-4 sm:mx-0">
          <FundraiserMediaSlider
            media={media}
            title={fundraiser.title}
            category={fundraiserCategory}
          />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        {/* Organizer → beneficiary attribution. Sits directly beneath the
            title (which is overlaid on the hero photo above), so the first
            thing read after the campaign name is who runs it and who it
            helps. */}
        {beneficiary && (
          <p className="-mb-4 text-sm font-medium text-zinc-500">
            Organized by{" "}
            {organizerProfileId ? (
              <Link
                href={`/organizers/${organizerProfileId}`}
                className="font-black text-zinc-900 hover:text-brand-700 hover:underline"
              >
                {organizerName}
              </Link>
            ) : (
              <span className="font-black text-zinc-900">{organizerName}</span>
            )}
            <span aria-hidden> · </span>
            for <span className="font-black text-zinc-900">{beneficiaryForLabel(beneficiary)}</span>
          </p>
        )}

        {/* Raised / progress / goal / donation count + Donate + Share — the
            first fundraising content the user sees, immediately below the
            hero (the campaign title now lives as an overlay on the hero
            photo itself — see FundraiserMediaSlider). `id` preserved for
            FundraiserFloatingActions' scroll observer (see
            FundraiserActions.tsx). */}
        <section id="main-donation-card" className="min-w-0 space-y-5">
          <div className="flex items-center gap-4">
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
              {fundraiser.review_count > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
                  <StarRating value={fundraiser.average_rating} size={14} />
                  <span className="font-bold text-zinc-700">
                    {Number(fundraiser.average_rating).toFixed(1)}
                  </span>
                  <span>
                    ({fundraiser.review_count} {fundraiser.review_count === 1 ? "review" : "reviews"})
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2.5">
            <a
              href={`/fundraisers/${fundraiser.slug}/donate`}
              className="flex min-h-[48px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-brand-300 px-4 py-3.5 text-base font-black text-brand-900 transition hover:bg-brand-400 active:scale-[0.98] shadow-sm sm:px-6"
            >
              Donate now
            </a>
            <ShareFundraiserButton
              title={fundraiser.title}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-900 px-4 py-3.5 text-base font-black text-brand-300 transition hover:bg-brand-950 active:scale-[0.98] shadow-sm sm:px-6"
            />
          </div>
        </section>

        <FundraiserStory description={description} />

        {/* Recent donors */}
        <section className="min-w-0">
          <h2 className="text-base font-bold text-zinc-950">Recent donors</h2>
          <DonorList
            fundraiserId={fundraiser.id}
            initialDonations={recentDonors.map((d) => ({
              ...d,
              profile: d.user_id ? publicProfileById.get(d.user_id) ?? null : null,
            }))}
            initialHasMore={donationCount > recentDonors.length}
          />
        </section>

        {updates.length > 0 && (
          <section className="min-w-0 border-b border-zinc-200 pb-8">
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

        <FundraiserShare
          title={fundraiser.title}
          imageUrl={coverImage}
          organizerName={organizerName}
          raised={raised}
          goal={goal}
          donateSlug={fundraiser.slug}
        />

        {/* ── Organiser & Beneficiary ─────────────────────────── */}
        <section className="min-w-0 border-t border-zinc-200 pt-8">
          <h2 className="text-lg font-black text-zinc-950 break-words">
            Organiser and beneficiary
          </h2>
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center text-sm font-black text-zinc-700">
                {initial(organizerName)}
              </div>
              <div className="min-w-0">
                {organizerProfileId ? (
                  <Link
                    href={`/organizers/${organizerProfileId}`}
                    className="block truncate text-sm font-black text-zinc-950 hover:text-brand-700 hover:underline transition"
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
                      href={"mailto:support@aldriva.com?subject=Message%20for%20" + encodeURIComponent(organizerName)}
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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center text-sm font-black text-brand-800">
                {initial(beneficiaryName)}
              </div>
              <div className="min-w-0">
                {beneficiaryOrganizer?.id ? (
                  <Link
                    href={`/organizers/${beneficiaryOrganizer.id}`}
                    className="block truncate text-sm font-black text-zinc-950 hover:text-brand-700 hover:underline transition"
                  >
                    {beneficiaryName}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-black text-zinc-950">
                    {beneficiaryName}
                  </span>
                )}
                <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-800">
                  {/* Relationship when we have one ("Mother"), otherwise the
                      beneficiary type ("Registered charity"), falling back to
                      the generic label. */}
                  {beneficiary?.relationship ||
                    (beneficiary && beneficiary.type !== "self"
                      ? beneficiaryTypeLabel(beneficiary.type)
                      : "Beneficiary")}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Created {createdAgo(fundraiserCreatedAt)}
            {fundraiserCategory ? ` · ${fundraiserCategory}` : ""}
          </p>

          <a
            href={`mailto:support@aldriva.com?subject=Report%20fundraiser%3A%20${encodeURIComponent(fundraiser.title)}`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-red-500"
          >
            <Flag className="h-3.5 w-3.5" />
            Report fundraiser
          </a>
        </section>

        {/* Donation protection — moved out of the top section per the new
            hierarchy; still present, just lower-priority than the campaign
            story and donor trust signals. */}
        <div className="flex justify-center sm:justify-start">
          <DonationProtectedBadge />
        </div>

        {/* ── Words of Support — always visible ───────────────── */}
        <div className="min-w-0 border-t border-zinc-200 pt-8">
          <SupportMessages fundraiserId={fundraiser.id} />
        </div>
      </div>

      {/* ── Trust triad ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="text-center sm:text-left">
            <Zap className="mx-auto h-8 w-8 text-brand-700 sm:mx-0" />
            <h3 className="mt-3 text-lg font-black text-zinc-950">Easy</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Donate quickly and securely
            </p>
          </div>
          <div className="text-center sm:text-left">
            <HeartHandshake className="mx-auto h-8 w-8 text-brand-700 sm:mx-0" />
            <h3 className="mt-3 text-lg font-black text-zinc-950">Powerful</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Send help directly to the people and causes you care about
            </p>
          </div>
          <div className="text-center sm:text-left">
            <ShieldCheck className="mx-auto h-8 w-8 text-brand-700 sm:mx-0" />
            <h3 className="mt-3 text-lg font-black text-zinc-950">Trusted</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Every fundraiser is reviewed —{" "}
              <Link
                href="/reviews"
                className="font-bold text-brand-800 hover:underline"
              >
                see what real donors are saying
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Related fundraisers ─────────────────────────────────────── */}
      {relatedFundraisers.length > 0 && (
        <section className="bg-brand-950 py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-wider text-brand-400">
                Making a Difference
              </p>
              <h2 className="mt-1 text-3xl font-black text-white">
                More ways to make a difference
              </h2>
              <p className="mt-1 text-sm font-medium text-brand-100/70">
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

      {/* Sticky bottom actions bar on mobile & tablet */}
      <FundraiserFloatingActions
        title={fundraiser.title}
        slug={fundraiser.slug}
        raised={raised}
        goal={goal}
        percentage={percentage}
        donationCount={donationCount}
      />
    </main>
  );
}
