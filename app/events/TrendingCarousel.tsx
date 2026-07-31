"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EventCard from "@/components/EventCard";
import { cn } from "@/lib/utils";

export type TrendingItem = {
  id: string;
  slug: string;
  title: string;
  eventDate: string | null;
  city: string | null;
  venue: string | null;
  banner: string | null;
  category: string | null;
};

const FALLBACK_DATE = "Date TBA";

function formatEventDate(eventDate: string | null): string {
  if (!eventDate) return FALLBACK_DATE;
  const value = new Date(eventDate);
  if (Number.isNaN(value.getTime())) return FALLBACK_DATE;
  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const PAGE_SIZE = 4;

/**
 * "Trending Events" rail with SeatGeek-style pagination: prev/next arrows and
 * an "X of Y" indicator top-right of the section header, paging through the
 * (already deduped) trending list in groups of 4.
 */
export default function TrendingCarousel({
  items,
  onDark = false,
}: {
  items: TrendingItem[];
  onDark?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const [page, setPage] = useState(0);

  const start = page * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h3
          className={cn(
            "text-2xl font-black sm:text-3xl",
            onDark ? "text-white" : "text-zinc-950"
          )}
        >
          Trending Events
        </h3>

        {totalPages > 1 && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-1.5 py-1",
              onDark ? "border-white/20 bg-white/5" : "border-zinc-200 bg-white"
            )}
          >
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous trending events"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition disabled:pointer-events-none disabled:opacity-40",
                onDark
                  ? "text-zinc-300 hover:bg-white/10 hover:text-orange-400"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-orange-600"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              className={cn(
                "min-w-[3.5rem] text-center text-xs font-black",
                onDark ? "text-zinc-100" : "text-zinc-700"
              )}
            >
              {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              aria-label="Next trending events"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition disabled:pointer-events-none disabled:opacity-40",
                onDark
                  ? "text-zinc-300 hover:bg-white/10 hover:text-orange-400"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-orange-600"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((event) => (
          <EventCard
            key={event.id}
            slug={event.slug}
            title={event.title}
            date={formatEventDate(event.eventDate)}
            eventDate={event.eventDate}
            location={event.city || event.venue || "Location TBA"}
            image={event.banner || ""}
            category={event.category}
            onDark={onDark}
          />
        ))}
      </div>
    </section>
  );
}
