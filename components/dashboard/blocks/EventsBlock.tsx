import Link from "next/link";
import { IconCalendar as Calendar, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { AccountBlockRow } from "./AccountBlockRow";
import type { EventItem } from "@/lib/dashboard/account-blocks-registry";

interface EventsBlockProps {
  events: EventItem[];
}

export function EventsBlock({ events }: EventsBlockProps) {
  if (events.length === 0) return null;

  const showViewAll = events.length > 3;
  const displayedEvents = events.slice(0, 3);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-950">Events</h2>
            <p className="text-xs text-zinc-500">Your events, invitations, and team assignments</p>
          </div>
        </div>

        {showViewAll && (
          <Link
            href="/dashboard/events"
            className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline transition"
          >
            <span>View all ({events.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <div className="divide-y divide-zinc-100 pt-1">
        {displayedEvents.map((ev) => (
          <AccountBlockRow
            key={ev.id}
            id={ev.id}
            title={ev.title}
            subtitle={ev.subtitle}
            status={ev.status}
            createdAt={ev.created_at}
            href={ev.href}
            actionLabel={ev.isDraftGroup ? "Finish" : "View"}
            isDraftGroup={ev.isDraftGroup}
          />
        ))}
      </div>
    </section>
  );
}
