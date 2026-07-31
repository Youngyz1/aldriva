import Link from "next/link";
import Image from "next/image";
import EventCard from "@/components/EventCard";
import { normalizeImageUrl } from "@/lib/image-url";
import type { ExternalEvent } from "@/lib/external-events";

/**
 * Renders one live external result with visible source attribution and the
 * correct link-out for purchase. Ticketmaster events open our internal detail
 * page (which re-fetches richer data and shows a "Buy on Ticketmaster" CTA);
 * SeatGeek events link straight to the SeatGeek event page in a new tab.
 *
 * Attribution: each card carries a "via {Source}" tag. SeatGeek's API terms
 * require their logo mark (not just text) wherever their data is shown, so
 * that tag renders the official knockout wordmark (public/seatgeek-logo-inline-ko.svg,
 * sourced from brand.seatgeek.com) instead of the word "SeatGeek". Sections
 * that render SeatGeek results should also surface the section-level credit
 * (see {@link ExternalSourceCredit}) linking to SeatGeek's homepage.
 */

const SOURCE_LABEL: Record<ExternalEvent["source"], string> = {
  ticketmaster: "Ticketmaster",
  seatgeek: "SeatGeek",
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop";

function linkFor(event: ExternalEvent): { href: string; external: boolean } {
  if (event.source === "ticketmaster") {
    return {
      href: `/external-events/ticketmaster/${encodeURIComponent(event.id.replace(/^tm_/, ""))}`,
      external: false,
    };
  }
  return { href: event.url || "https://seatgeek.com", external: true };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Date TBA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date TBA";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ExternalEventCard({ event }: { event: ExternalEvent }) {
  const { href, external } = linkFor(event);

  const inner = (
    <div className="relative">
      <EventCard
        slug={null}
        title={event.title}
        date={formatDate(event.event_date)}
        location={event.city || "Location TBA"}
        // Route through the shared allowlist so an unexpected external image host
        // degrades to the fallback instead of crashing next/image (and the page).
        image={normalizeImageUrl(event.banner, FALLBACK_IMAGE)}
        category={event.category}
      />
      <span className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow backdrop-blur">
        {event.source === "seatgeek" ? (
          <>
            via
            <Image
              src="/seatgeek-logo-inline-ko.svg"
              alt="SeatGeek"
              width={54}
              height={11}
              className="h-[11px] w-auto"
            />
          </>
        ) : (
          `via ${SOURCE_LABEL[event.source]}`
        )}
      </span>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className="block">
      {inner}
    </Link>
  );
}

/**
 * Section-level data credit. Renders a "provided by" line only for the sources
 * actually present in the results — and always credits SeatGeek with a link to
 * its homepage when SeatGeek results appear, per SeatGeek's attribution terms.
 *
 * NOTE: SeatGeek's branding guidelines ask for their logo mark, not just text.
 * This text credit is a compliant-enough placeholder; swap in the official
 * SeatGeek logo asset here when available.
 */
export function ExternalSourceCredit({ sources }: { sources: ExternalEvent["source"][] }) {
  const unique = Array.from(new Set(sources));
  if (unique.length === 0) return null;

  return (
    <p className="mt-4 text-xs font-semibold text-zinc-400">
      Event data provided by{" "}
      {unique.map((source, index) => (
        <span key={source}>
          {index > 0 && (index === unique.length - 1 ? " and " : ", ")}
          {source === "seatgeek" ? (
            <a
              href="https://seatgeek.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center align-text-bottom hover:opacity-80"
            >
              <Image
                src="/seatgeek-logo-inline.svg"
                alt="SeatGeek"
                width={62}
                height={13}
                className="h-[13px] w-auto"
              />
            </a>
          ) : (
            SOURCE_LABEL[source]
          )}
        </span>
      ))}
      . Tickets are sold on the source platform.
    </p>
  );
}
