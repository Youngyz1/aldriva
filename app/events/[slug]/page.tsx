import type { Metadata } from "next";
import Image from "next/image";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import TicketCheckout from "./TicketCheckout";
import VenueMapClient from "@/components/VenueMapClient";
import { createSupabaseServer } from "@/lib/supabase-server";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import EventPageClient from "./EventPageClient";
import AboutSection from "./AboutSection";
import StarRating from "@/components/StarRating";
import { normalizeImageUrl } from "@/lib/image-url";
import { getSiteUrl } from "@/lib/site-url";
import { getVisitorCountry } from "@/lib/request-geo";
import {
  absoluteUrl as toAbsoluteUrl,
  compactJsonLd,
  jsonLdScriptValue,
  stripHtml,
} from "@/lib/structured-data";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1600&auto=format&fit=crop";

type OptionalEventFields = {
  address?: string | null;
  street_address?: string | null;
  address_locality?: string | null;
  address_region?: string | null;
  postal_code?: string | null;
  zip_code?: string | null;
  zip?: string | null;
  address_country?: string | null;
  state?: string | null;
  region?: string | null;
  country?: string | null;
  country_code?: string | null;
  end_date?: string | null;
  event_type?: string | null;
  online_url?: string | null;
  virtual_url?: string | null;
  performer?: string | null;
  performer_name?: string | null;
  highlights?: string | null;
  refund_policy?: string | null;
  source_url?: string | null;
};

/** Deduplicated cache helper for querying event details. */
const getEventBySlug = cache(async (slug: string) => {
  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, description, banner, city, venue, event_date, category, organizer_id, visibility, user_id, latitude, longitude, review_count, average_rating, source_organizer_name, source_organizer_url, source_url, created_at, status")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return event;
});

const OPTIONAL_EVENT_FIELDS = [
  "address", "street_address", "address_locality", "address_region",
  "postal_code", "zip_code", "zip", "address_country", "state", "region",
  "country", "country_code", "end_date", "event_type", "online_url",
  "virtual_url", "performer", "performer_name", "highlights",
  "refund_policy", "source_url",
] as const;

const getOptionalEventFields = cache(async (eventId: string) => {
  const { data, error } = await supabase
    .from("events")
    .select(OPTIONAL_EVENT_FIELDS.join(", "))
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) {
    return Object.fromEntries(
      OPTIONAL_EVENT_FIELDS.map((f) => [f, null])
    ) as OptionalEventFields;
  }
  return data as unknown as OptionalEventFields;
});

/** Deduplicated cache helper for querying tickets. */
const getTicketsByEventId = cache(async (eventId: string) => {
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, name, price, quantity, event_id")
    .eq("event_id", eventId);
  return tickets;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  const title = event?.title
    ? `${event.title} — Aldriva`
    : "Event — Aldriva";
  const description =
    event?.description ||
    (event?.city ? `Join us in ${event.city}` : "Buy tickets for this event on Aldriva.");
  const image = normalizeImageUrl(event?.banner, "/og-image.png");

  return {
    metadataBase: new URL("https://www.fund4agoodcause.com"),
    title,
    description,
    alternates: {
      canonical: `https://www.fund4agoodcause.com/events/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://www.fund4agoodcause.com/events/${slug}`,
      siteName: "Aldriva",
      images: [{ url: image, width: 1200, height: 630, alt: event?.title || "Event" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/** Forward-geocode a free-text address via Nominatim (no API key needed). */
async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Aldriva/1.0", "Accept-Language": "en" },
      next: { revalidate: 86400 }, // cache 24 h per address
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function getHostingYears(createdAt: string) {
  return Math.max(
    1,
    Math.floor(
      (Date.now() - new Date(createdAt).getTime()) /
        (1000 * 60 * 60 * 24 * 365)
    )
  );
}

function eventStatusUrl(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "cancelled":
    case "canceled":
      return "https://schema.org/EventCancelled";
    case "postponed":
      return "https://schema.org/EventPostponed";
    case "rescheduled":
      return "https://schema.org/EventRescheduled";
    default:
      return "https://schema.org/EventScheduled";
  }
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const event = await getEventBySlug(slug);

  if (!event) return notFound();
  const optionalEvent = await getOptionalEventFields(event.id);
  const defaultCountry = await getVisitorCountry();
  const eventImage = normalizeImageUrl(event.banner, FALLBACK_EVENT_IMAGE);

  if (event.visibility === "private") {
    const supabaseServer = await createSupabaseServer();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user || user.id !== event.user_id) return notFound();
  }

  const { data: organizer } = event.organizer_id
    ? await supabase
        .from("organizers")
        .select("id, name, bio, photo, website, status, created_at, follower_offset, events_offset")
        .eq("id", event.organizer_id)
        .single()
    : { data: null };

  const tickets = await getTicketsByEventId(event.id);


  // Count organizer's events and fundraisers
  const [
    { count: organizerEventCount },
    { count: organizerFundraiserCount },
    { count: followerCount },
  ] = await Promise.all([
    organizer?.id
      ? supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", organizer.id)
          .eq("visibility", "public")
      : Promise.resolve({ count: 0 }),
    organizer?.id
      ? supabase
          .from("fundraisers")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", organizer.id)
      : Promise.resolve({ count: 0 }),
    organizer?.id
      ? supabase
          .from("organizer_follows")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", organizer.id)
      : Promise.resolve({ count: 0 }),
  ]);

  // More events from same organizer, falling back to any other public
  // events happening within a 2-week window of this event's date.
  type MoreEvent = {
    id: string;
    title: string;
    slug: string;
    banner: string | null;
    event_date: string | null;
    city: string | null;
    venue: string | null;
  };

  let moreEvents: MoreEvent[] = [];
  let moreEventsSource: "organizer" | "related" | null = null;

  if (organizer?.id) {
    const { data } = await supabase
      .from("events")
      .select("id, title, slug, banner, event_date, city, venue")
      .eq("organizer_id", organizer.id)
      .neq("id", event.id)
      .eq("visibility", "public")
      .order("event_date", { ascending: true })
      .limit(4);
    moreEvents = data || [];
    if (moreEvents.length > 0) moreEventsSource = "organizer";
  }

  if (moreEvents.length === 0 && event.event_date) {
    const eventDate = new Date(event.event_date);
    if (!Number.isNaN(eventDate.getTime())) {
      const windowStart = new Date(eventDate);
      windowStart.setDate(windowStart.getDate() - 14);
      const windowEnd = new Date(eventDate);
      windowEnd.setDate(windowEnd.getDate() + 14);

      const { data: related } = await supabase
        .from("events")
        .select("id, title, slug, banner, event_date, city, venue")
        .neq("id", event.id)
        .eq("visibility", "public")
        .gte("event_date", windowStart.toISOString())
        .lte("event_date", windowEnd.toISOString())
        .order("event_date", { ascending: true })
        .limit(4);

      if (related && related.length > 0) {
        moreEvents = related;
        moreEventsSource = "related";
      }
    }
  }

  const lowestPrice =
    tickets && tickets.length > 0
      ? Math.min(...tickets.map((t) => t.price))
      : null;

  const primaryOrganizerName =
    event.source_organizer_name || organizer?.name || "";
  const primaryOrganizerUrl =
    event.source_organizer_url ||
    (organizer ? `/organizers/${organizer.id}` : "");
  const primaryOrganizerPhoto = event.source_organizer_name
    ? ""
    : normalizeImageUrl(organizer?.photo, "");
  const eventAddress = optionalEvent.address || "";
  const eventHighlights = optionalEvent.highlights || "";
  const eventRefundPolicy = optionalEvent.refund_policy || "";
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const canonicalEventUrl = `${siteUrl}/events/${slug}`;

  // ── Resolve map coordinates ──────────────────────────────────
  // Use stored lat/lng if available; otherwise geocode from address fields.
  let mapLat: number | null = event.latitude ?? null;
  let mapLng: number | null = event.longitude ?? null;

  if (!mapLat || !mapLng) {
    const addressQuery = [
      eventAddress,
      event.venue,
      event.city,
      optionalEvent.state,
      optionalEvent.country,
    ]
      .filter(Boolean)
      .join(", ");

    if (addressQuery.trim()) {
      const coords = await geocodeAddress(addressQuery);
      if (coords) {
        mapLat = coords.lat;
        mapLng = coords.lng;
      }
    }
  }

  const ticketLabel =
    lowestPrice === null
      ? "Tickets TBA"
      : lowestPrice === 0
        ? "Free"
        : `$${Number(lowestPrice).toFixed(2)}`;

  const formattedDate = event.event_date
    ? new Date(event.event_date).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date TBA";

  const hostingYears = organizer?.created_at
    ? getHostingYears(organizer.created_at)
    : null;

  // ── Title size scales down for longer event names so the hero
  // block doesn't balloon in height on long titles ───────────────
  const titleSizeClass =
    event.title.length > 60
      ? "text-lg sm:text-xl lg:text-2xl"
      : event.title.length > 35
        ? "text-xl sm:text-2xl lg:text-3xl"
        : "text-2xl sm:text-3xl lg:text-4xl";

  const streetAddress =
    optionalEvent.street_address || optionalEvent.address || "";
  const addressLocality = optionalEvent.address_locality || event.city || "";
  const addressRegion =
    optionalEvent.address_region || optionalEvent.region || optionalEvent.state || "";
  const postalCode =
    optionalEvent.postal_code || optionalEvent.zip_code || optionalEvent.zip || "";
  const addressCountry =
    optionalEvent.address_country || optionalEvent.country_code || optionalEvent.country || "";
  const eventType = (optionalEvent.event_type || "").toLowerCase();
  const hasPhysicalLocation = Boolean(
    event.venue ||
      streetAddress ||
      addressLocality ||
      addressRegion ||
      postalCode ||
      addressCountry ||
      mapLat ||
      mapLng
  );
  const isHybridEvent = eventType.includes("hybrid");
  const isVirtualEvent =
    eventType.includes("virtual") ||
    eventType.includes("online") ||
    (!hasPhysicalLocation && !isHybridEvent);
  const virtualLocation = {
    "@type": "VirtualLocation",
    url:
      toAbsoluteUrl(optionalEvent.virtual_url, siteUrl) ||
      toAbsoluteUrl(optionalEvent.online_url, siteUrl) ||
      canonicalEventUrl,
  };
  const physicalLocation = {
    "@type": "Place",
    name: event.venue || addressLocality || undefined,
    address: {
      "@type": "PostalAddress",
      name:
        !streetAddress &&
        !addressLocality &&
        !addressRegion &&
        !postalCode &&
        !addressCountry
          ? event.venue || undefined
          : undefined,
      streetAddress: streetAddress || undefined,
      addressLocality: addressLocality || undefined,
      addressRegion: addressRegion || undefined,
      postalCode: postalCode || undefined,
      addressCountry: addressCountry || undefined,
    },
    geo:
      mapLat && mapLng
        ? {
            "@type": "GeoCoordinates",
            latitude: mapLat,
            longitude: mapLng,
          }
        : undefined,
  };
  const eventLocation = isVirtualEvent
    ? virtualLocation
    : isHybridEvent
      ? [physicalLocation, virtualLocation]
      : physicalLocation;
  const ticketOffers =
    tickets && tickets.length > 0
      ? tickets.map((ticket) => ({
          "@type": "Offer",
          name: ticket.name || undefined,
          priceCurrency: "USD",
          price: Number(ticket.price ?? 0),
          availability:
            Number(ticket.quantity ?? 0) <= 0
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
          url: `${canonicalEventUrl}#tickets`,
        }))
      : undefined;
  const performerName =
    optionalEvent.performer || optionalEvent.performer_name || "";

  // ── JSON-LD structured data (Event schema) ──────────────
  const jsonLd = compactJsonLd({
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: stripHtml(event.description) || undefined,
    image: eventImage,
    url: canonicalEventUrl,
    startDate: event.event_date || undefined,
    endDate: optionalEvent.end_date || undefined,
    eventStatus: eventStatusUrl(event.status),
    eventAttendanceMode: isVirtualEvent
      ? "https://schema.org/OnlineEventAttendanceMode"
      : isHybridEvent
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location: eventLocation,
    organizer: primaryOrganizerName ? {
      "@type": "Organization",
      name: primaryOrganizerName,
      url: primaryOrganizerUrl
        ? primaryOrganizerUrl.startsWith("http")
          ? primaryOrganizerUrl
          : `https://www.fund4agoodcause.com${primaryOrganizerUrl}`
        : undefined,
    } : undefined,
    offers: ticketOffers && ticketOffers.length === 1 ? ticketOffers[0] : ticketOffers,
    performer: performerName
      ? {
          "@type": "PerformingGroup",
          name: performerName,
        }
      : undefined,
  });

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptValue(jsonLd) }}
      />
      {/* ── Banner image ───────────────── */}
      <div className="w-full overflow-hidden md:relative md:flex md:h-[400px] md:items-center md:justify-center md:bg-zinc-950 lg:h-[450px]">
        {/* Blurred background for desktop */}
        <div className="hidden md:block absolute inset-0 select-none pointer-events-none opacity-40 blur-2xl">
          <Image
            src={eventImage}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>

        {/* Main image */}
        <Image
          src={eventImage}
          alt={event.title}
          width={1200}
          height={675}
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
          className="aspect-video w-full object-cover sm:aspect-auto sm:max-h-[500px] md:relative md:z-10 md:h-full md:w-auto md:max-w-7xl md:object-contain md:object-center lg:max-h-[450px]"
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* ── Title + share/save row ────────────────────────── */}
        <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 overflow-x-clip">
            {event.category && (
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-600">
                {event.category}
              </p>
            )}
            <h1 className={`font-black leading-tight ${titleSizeClass}`}>
              {event.title}
            </h1>
            {event.review_count > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-zinc-600">
                <StarRating value={event.average_rating} size={16} />
                <span className="font-bold text-zinc-800">
                  {Number(event.average_rating).toFixed(1)}
                </span>
                <span>
                  ({event.review_count} {event.review_count === 1 ? "review" : "reviews"})
                </span>
              </div>
            )}
            {primaryOrganizerName && (
              <p className="mt-2 text-sm text-zinc-500">
                by{" "}
                {primaryOrganizerUrl ? (
                  <a
                    href={primaryOrganizerUrl}
                    className="font-bold text-zinc-800 hover:text-orange-600"
                  >
                    {primaryOrganizerName}
                  </a>
                ) : (
                  <span className="font-bold text-zinc-800">
                    {primaryOrganizerName}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            <EventPageClient
              eventTitle={event.title}
              eventSlug={event.slug}
            />
          </div>
        </div>

        {/* ── Slim info row ─────────────────────────────────── */}
        <div className="mt-4 flex flex-col gap-2 border-b border-zinc-100 pb-5 text-sm text-zinc-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
          {event.event_date && (
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {formattedDate}
            </span>
          )}
          {(event.venue || event.city) && (
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [event.venue, event.city].filter(Boolean).join(", ")
                )}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-orange-600 hover:underline transition"
              >
                {[event.venue, event.city].filter(Boolean).join(" · ")}
              </a>
            </span>
          )}
          {lowestPrice !== null && (
            <span className="flex items-center gap-1.5 font-bold text-zinc-800">
              <svg
                className="h-4 w-4 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                />
              </svg>
              {ticketLabel}
            </span>
          )}
        </div>

        {/* ── Main 2-col layout ───────────────────── */}
        <div className="grid gap-8 pb-24 pt-8 lg:grid-cols-3 lg:gap-12 lg:pb-10">
          <div className="space-y-8 lg:col-span-2">
            {/* About */}
            <section>
              <h2 className="text-xl font-black mb-4">About this event</h2>
              <AboutSection description={event.description || ""} />
            </section>

            {/* Good to Know + Refund Policy */}
            {(eventHighlights || eventRefundPolicy) && (
              <section>
                <h2 className="text-xl font-black mb-4">Good to know</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {eventHighlights && (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                      <h3 className="font-black mb-3">Highlights</h3>
                      <p className="text-sm text-zinc-600 whitespace-pre-wrap">
                        {eventHighlights}
                      </p>
                    </div>
                  )}
                  {eventRefundPolicy && (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                      <h3 className="font-black mb-3">Refund Policy</h3>
                      <p className="text-sm text-zinc-600 whitespace-pre-wrap">
                        {eventRefundPolicy}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Collapsible FAQ */}
            <section>
              <h2 className="text-xl font-black mb-4">
                Frequently asked questions
              </h2>
              <FaqSection organizerName={primaryOrganizerName} />
            </section>

            {/* Organizer */}
            {primaryOrganizerName && (
              <section>
                <h2 className="text-xl font-black mb-4">Organised by</h2>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
                      {primaryOrganizerPhoto ? (
                        <Image
                          src={primaryOrganizerPhoto}
                          alt={primaryOrganizerName}
                          width={56}
                          height={56}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <LocalBrandedPlaceholder
                          variant="avatar"
                          title={primaryOrganizerName}
                          initials={primaryOrganizerName.charAt(0).toUpperCase()}
                          className="from-orange-100 to-orange-100 text-base text-orange-700"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          {primaryOrganizerUrl ? (
                            <a
                              href={primaryOrganizerUrl}
                              target={
                                primaryOrganizerUrl.startsWith("http")
                                  ? "_blank"
                                  : undefined
                              }
                              rel={
                                primaryOrganizerUrl.startsWith("http")
                                  ? "noreferrer"
                                  : undefined
                              }
                              className="inline-flex flex-wrap items-center gap-2 break-words text-base font-black text-zinc-950 hover:text-orange-600"
                            >
                              {primaryOrganizerName}
                              <VerifiedBadge
                                verified={organizer?.status === "verified"}
                              />
                            </a>
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-2 break-words text-base font-black">
                              {primaryOrganizerName}
                              <VerifiedBadge
                                verified={organizer?.status === "verified"}
                              />
                            </span>
                          )}
                          {organizer && (
                            <div className="mt-1 flex gap-5 text-sm text-zinc-500">
                              <span>
                                <strong className="text-zinc-800">
                                  {(followerCount ?? 0) + (organizer.follower_offset ?? 0)}
                                </strong>{" "}
                                Followers
                              </span>
                              <span>
                                <strong className="text-zinc-800">
                                  {(organizerEventCount ?? 0) +
                                    (organizer.events_offset ?? 0) +
                                    (organizerFundraiserCount ?? 0)}
                                </strong>{" "}
                                Events
                              </span>
                              {hostingYears && (
                                <span>
                                  <strong className="text-zinc-800">
                                    {hostingYears}
                                  </strong>{" "}
                                  {hostingYears === 1 ? "year" : "years"}{" "}
                                  hosting
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {organizer && (
                          <div className="flex gap-3 shrink-0">
                            <a
                              href={`mailto:support@fund4agoodcause.com?subject=Contact%20${encodeURIComponent(
                                primaryOrganizerName
                              )}`}
                              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100 transition"
                            >
                              Contact
                            </a>
                            <a
                              href={`/organizers/${organizer.id}`}
                              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 transition"
                            >
                              Follow
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Eventbrite-imported events must link back to the specific source
                listing (crawlable, no nofollow) per Eventbrite's API Terms of
                Use — a plain text link, since their terms separately forbid
                using Eventbrite's own branding/logo in a third-party app. */}
            {event.source_url && (
              <p className="text-sm text-zinc-500">
                Originally listed on{" "}
                <a
                  href={event.source_url}
                  target="_blank"
                  rel="noopener"
                  className="font-bold text-zinc-700 underline decoration-dotted underline-offset-2 hover:text-orange-600"
                >
                  Eventbrite
                </a>
              </p>
            )}

            {/* Venue Map */}
            {(event.venue || event.city || eventAddress) && (
              <section>
                <h2 className="text-xl font-black mb-4">Venue location</h2>
                <div className="rounded-2xl border border-zinc-200 overflow-hidden">
                  <div className="px-5 pt-5 pb-3">
                    <p className="font-bold text-zinc-900">
                      {event.venue || "Venue"}
                    </p>
                    {eventAddress && (
                      <p className="text-sm text-zinc-500">{eventAddress}</p>
                    )}
                    {event.city && (
                      <p className="text-sm text-zinc-500">{event.city}</p>
                    )}
                  </div>
                  {mapLat && mapLng ? (
                    <VenueMapClient
                      lat={mapLat}
                      lng={mapLng}
                      title={event.title}
                      venue={event.venue}
                      city={event.city}
                    />
                  ) : (
                    /* No coordinates at all — show a Google Maps link instead */
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [eventAddress, event.venue, event.city]
                          .filter(Boolean)
                          .join(", ")
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-40 items-center justify-center gap-2 bg-zinc-50 text-sm font-bold text-orange-600 hover:bg-orange-50 transition"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      View on Google Maps ↗
                    </a>
                  )}
                  {/* How to get there */}
                  <div className="border-t border-zinc-100 px-5 py-4">
                    <p className="mb-3 text-sm font-bold text-zinc-500">
                      How do you want to get there?
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { label: "Driving", icon: "🚗" },
                        { label: "Public transport", icon: "🚌" },
                        { label: "Biking", icon: "🚲" },
                        { label: "Walking", icon: "🚶" },
                      ].map(({ label, icon }) => (
                        <a
                          key={label}
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                            [event.venue, event.city]
                              .filter(Boolean)
                              .join(", ")
                          )}&travelmode=${
                            label === "Public transport"
                              ? "transit"
                              : label.toLowerCase()
                          }`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 hover:border-orange-300 hover:text-orange-600 transition"
                        >
                          <span>{icon}</span>
                          {label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Report event */}
            <div className="flex justify-center pt-2 pb-4">
              <a
                href={`mailto:support@fund4agoodcause.com?subject=Report%20event%3A%20${encodeURIComponent(
                  event.title
                )}`}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-500 transition"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                  />
                </svg>
                Report this event
              </a>
            </div>



            {/* More events from organizer */}
            {moreEvents && moreEvents.length > 0 && (
              <section>
                <h2 className="text-xl font-black mb-1 break-words">
                  {moreEventsSource === "organizer"
                    ? <>{`More events from `}{primaryOrganizerName || "this organization"}</>
                    : "Events you might also like"}
                </h2>
                <p className="text-sm text-zinc-500 mb-5">
                  {moreEventsSource === "organizer"
                    ? "Discover more events you might love."
                    : "Other events happening around the same time."}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {moreEvents.map((e) => (
                    <a
                      key={e.id}
                      href={`/events/${e.slug}`}
                      className="group rounded-2xl border border-zinc-200 overflow-hidden hover:border-orange-300 transition"
                    >
                      <div className="aspect-video w-full overflow-hidden bg-zinc-100">
                        <Image
                          src={normalizeImageUrl(e.banner, FALLBACK_EVENT_IMAGE)}
                          alt={e.title}
                          width={400}
                          height={225}
                          sizes="(max-width: 640px) 100vw, 400px"
                          className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>
                      <div className="p-4">
                        <p className="font-black text-zinc-950 line-clamp-2 group-hover:text-orange-600 transition">
                          {e.title}
                        </p>
                        {e.event_date && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {new Date(e.event_date).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                            {e.city ? ` · ${e.city}` : ""}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar ticket checkout */}
          <div id="tickets">
            <TicketCheckout
              event={{ ...event, source_url: optionalEvent.source_url ?? null }}
              tickets={tickets || []}
              lowestPrice={lowestPrice}
              defaultCountry={defaultCountry}
            />
          </div>
        </div>
      </div>

      {/* ── Sticky bottom bar ─────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div>
            <p className="text-base font-black">{ticketLabel}</p>
            <p className="text-xs text-zinc-500">{formattedDate}</p>
          </div>
          <a
            href="#tickets"
            className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-black text-white hover:bg-orange-600 transition"
          >
            Reserve a spot
          </a>
        </div>
      </div>
    </main>
  );
}

// ── Collapsible FAQ ──────────────────────────────────────
function FaqSection({ organizerName }: { organizerName: string }) {
  const faqs: [string, string][] = [
    [
      "How do I get my ticket?",
      "After checkout you will see your QR code ticket on screen. Download or screenshot it — you can also print it. Show the QR code to staff at the door.",
    ],
    [
      "Can I share this event?",
      "Yes. Copy the page link and share it with friends or your community.",
    ],
    [
      "Who should I contact about event details?",
      organizerName
        ? `Contact ${organizerName} using the organizer link when available.`
        : "Use the source or organizer information listed on this page.",
    ],
    [
      "What is the refund policy?",
      "No refunds unless the event is cancelled by the organizer. Contact the organizer directly for special circumstances.",
    ],
  ];

  return (
    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 overflow-hidden">
      {faqs.map(([question, answer]) => (
        <FaqItem key={question} question={question} answer={answer} />
      ))}
    </div>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <details className="group bg-white px-5 py-1">
      <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 font-bold text-zinc-950 list-none">
        {question}
        <svg
          className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </summary>
      <p className="pb-4 text-sm leading-relaxed text-zinc-600">{answer}</p>
    </details>
  );
}
