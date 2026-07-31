import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getCachedTicketmasterEvent, type RawEvent } from "@/lib/ticketmaster-event";

function eventImage(event: RawEvent) {
  return (
    event.images?.find((image) => image.ratio === "16_9" && (image.width ?? 0) >= 1000)?.url ||
    event.images?.find((image) => image.ratio === "16_9")?.url ||
    event.images?.[0]?.url ||
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1600&auto=format&fit=crop"
  );
}

type EventDateInfo = { date: Date; timeZone: string };

/**
 * Ticketmaster's `dates.start.localDate`/`localTime` are already the venue's
 * correct wall-clock time — no conversion needed. The bug this replaces
 * preferred `dateTime` (a UTC instant) and formatted it with no `timeZone`,
 * so it rendered in whatever zone the server happened to run in (an 8:30pm
 * show in Las Vegas was showing up as ~4am). Anchoring the already-correct
 * local numbers via `Date.UTC` and formatting pinned to "UTC" below means
 * nothing shifts them a second time. `dateTime` + `dates.timezone` (or the
 * venue's own `timezone`) is only the fallback for the rare event missing
 * local fields entirely.
 */
function eventDateInfo(event: RawEvent): EventDateInfo | null {
  const start = event.dates?.start;
  if (start?.localDate) {
    const [year, month, day] = start.localDate.split("-").map(Number);
    const [hour, minute] = (start.localTime || "00:00:00").split(":").map(Number);
    return { date: new Date(Date.UTC(year, month - 1, day, hour, minute)), timeZone: "UTC" };
  }
  if (start?.dateTime) {
    const timeZone = event.dates?.timezone || event._embedded?.venues?.[0]?.timezone;
    if (timeZone) return { date: new Date(start.dateTime), timeZone };
  }
  return null;
}

function formattedDate(info: EventDateInfo | null) {
  if (!info || Number.isNaN(info.date.getTime())) return "Date TBA";

  return info.date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: info.timeZone,
  });
}

/**
 * Ticketmaster's `description` field is essentially never populated (checked
 * a real sample: 0/20). `info` sometimes is genuine event content; `pleaseNote`
 * is almost always a disclaimer (pricing/accessibility/content warnings), not
 * a description — so it gets an honest "Good to know" heading instead of
 * being passed off as "About this event".
 */
function aboutContent(event: RawEvent): { heading: string; body: string } | null {
  if (event.info) return { heading: "About this event", body: event.info };
  if (event.pleaseNote) return { heading: "Good to know", body: event.pleaseNote };
  return null;
}

function priceLabel(event: RawEvent) {
  const range = event.priceRanges?.[0];
  if (!range || range.min === undefined) return "Price shown at checkout";

  const currency = range.currency || "USD";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  if (range.max !== undefined && range.max !== range.min) {
    return `${formatter.format(range.min)} - ${formatter.format(range.max)}`;
  }

  return `From ${formatter.format(range.min)}`;
}

function TicketmasterUnavailable({ id }: { id: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center">
      <p className="text-sm font-black uppercase tracking-wide text-orange-600">Ticketmaster</p>
      <h1 className="mt-2 text-2xl font-black text-zinc-950">Couldn&apos;t load this event</h1>
      <p className="mt-3 max-w-md text-zinc-600">
        Ticketmaster didn&apos;t respond — this is usually temporary. Try again in a moment.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href={`/external-events/ticketmaster/${encodeURIComponent(id)}`}
          className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-700"
        >
          Try again
        </Link>
        <Link
          href="/events"
          className="rounded-xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-700 transition hover:border-orange-200 hover:text-orange-600"
        >
          Back to events
        </Link>
      </div>
    </main>
  );
}

export default async function TicketmasterEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, admin, dashboardContext] = await Promise.all([
    getCachedTicketmasterEvent(id).catch(() => null),
    isAdmin(),
    getDashboardContext(),
  ]);

  if (!result) return <TicketmasterUnavailable id={id} />;
  if (result.status === "not_found") return notFound();

  const event = result.event;
  const canClaimExternalEvent = admin || Boolean(dashboardContext?.organizerId);
  const dateInfo = eventDateInfo(event);
  const venue = event._embedded?.venues?.[0];
  const city = [venue?.city?.name, venue?.state?.stateCode || venue?.state?.name]
    .filter(Boolean)
    .join(", ");
  const category = [
    event.classifications?.[0]?.segment?.name,
    event.classifications?.[0]?.genre?.name,
  ].filter(Boolean).join(" / ") || "Event";
  const ticketUrl = event.url;
  const about = aboutContent(event);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="relative h-[320px] w-full overflow-hidden bg-zinc-950 sm:h-[430px] md:h-[500px] lg:h-[540px]">
        <Image
          src={eventImage(event)}
          alt={event.name || "Ticketmaster event"}
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-10 sm:px-6 sm:pb-12">
          <div className="max-w-4xl">
            <p className="mb-4 w-fit rounded-full bg-white px-4 py-2 text-sm font-black uppercase tracking-wide text-orange-600">
              Ticketmaster
            </p>
            <h1 className="text-3xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
              {event.name || "Untitled event"}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-100 sm:text-lg">
              {`View date, venue, and ticket options for this ${category.toLowerCase()}.`}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
          <div className="lg:col-span-2">
            {/* Key facts — Date, Venue, and Price grouped as one cluster
                rather than competing equal-weight boxes; Category rides
                along as a small tag instead of its own box. */}
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8">
              <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-zinc-600">
                {category}
              </span>
              <div className="mt-5 grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Date</p>
                  <h3 className="mt-1.5 text-lg font-bold leading-snug">{formattedDate(dateInfo)}</h3>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Venue</p>
                  <h3 className="mt-1.5 text-lg font-bold leading-snug">
                    {[venue?.name, city].filter(Boolean).join(", ") || "Venue TBA"}
                  </h3>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Tickets</p>
                  <h3 className="mt-1.5 text-lg font-bold leading-snug">{priceLabel(event)}</h3>
                </div>
              </div>
            </div>

            {about && (
              <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-8">
                <h2 className="mb-6 text-3xl font-black">{about.heading}</h2>
                <div className="space-y-5 text-lg leading-relaxed text-zinc-700">
                  <p>{about.body}</p>
                  {venue?.address?.line1 && (
                    <p>
                      <span className="font-black text-zinc-950">Address:</span>{" "}
                      {[venue.address.line1, city].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {canClaimExternalEvent && (
              <p className="mt-8 text-sm text-zinc-500">
                Organizing this event?{" "}
                <Link
                  href={`/import?mode=events&url=${encodeURIComponent(ticketUrl || "")}`}
                  className="font-bold text-orange-600 underline decoration-dotted underline-offset-2 hover:text-orange-700"
                >
                  Create or claim it on Aldriva
                </Link>{" "}
                to sell tickets directly.
              </p>
            )}
          </div>

          <aside className="h-fit rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:sticky lg:top-24 sm:p-8">
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">
              External ticket source
            </p>
            <h2 className="mt-2 text-3xl font-black">{priceLabel(event)}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Checkout and ticket delivery happen through Ticketmaster until the organizer sells this event directly on Aldriva.
            </p>
            {ticketUrl ? (
              <a
                href={ticketUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 block rounded-xl bg-orange-600 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-orange-700"
              >
                Buy on Ticketmaster
              </a>
            ) : (
              <button
                disabled
                className="mt-6 block w-full rounded-xl bg-zinc-200 px-5 py-3 text-center text-sm font-black text-zinc-500"
              >
                Tickets unavailable
              </button>
            )}
            <Link
              href="/events"
              className="mt-3 block rounded-xl border border-zinc-200 px-5 py-3 text-center text-sm font-black text-zinc-700 transition hover:border-orange-200 hover:text-orange-600"
            >
              Back to events
            </Link>
            <p className="mt-4 text-xs text-zinc-400">
              This event is pulled from Ticketmaster search results so you can discover it on Aldriva.
            </p>
          </aside>
        </div>
      </section>

    </main>
  );
}
