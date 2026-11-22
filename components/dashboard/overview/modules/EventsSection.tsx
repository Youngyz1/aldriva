/**
 * components/dashboard/overview/modules/EventsSection.tsx
 *
 * Real tenant-scoped Events operational section.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { StatCard } from "../StatCard";
import { EmptyState } from "../EmptyState";
import {
  IconCalendar as Calendar,
  IconArrowRight as ArrowRight,
  IconTicket as Ticket,
} from "@tabler/icons-react";

export interface EventsSectionProps {
  organizerId: string;
  canManage?: boolean;
}

interface EventRow {
  id: string;
  title: string;
  event_date: string | null;
  status: string;
}

export async function EventsSection({
  organizerId,
  canManage = true,
}: EventsSectionProps) {
  const supabase = createSupabaseAdmin();

  let events: EventRow[] = [];
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, event_date, status")
      .eq("organizer_id", organizerId)
      .is("deleted_at", null)
      .order("event_date", { ascending: true })
      .limit(5);

    if (!error && Array.isArray(data)) {
      events = data as EventRow[];
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[EventsSection] query error:", err);
    }
  }

  const upcomingEvents = events.filter((e) => e.status !== "cancelled");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Events & Ticketing
          </h2>
        </div>
        {canManage && (
          <Link
            href={`/dashboard/org/${organizerId}/events`}
            className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
          >
            <span>All events</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Upcoming Events"
          value={upcomingEvents.length}
          format="count"
          href={`/dashboard/org/${organizerId}/events`}
        />
        <StatCard
          label="Total Managed"
          value={events.length}
          format="count"
        />
      </div>

      {events.length === 0 ? (
        <EmptyState
          variant="section"
          title="No events scheduled"
          description="Create events, sell tickets, and manage guest check-ins."
          action={
            canManage
              ? {
                  label: "+ Create Event",
                  href: `/dashboard/org/${organizerId}/events/new`,
                }
              : undefined
          }
          icon={Calendar}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="min-h-[48px] flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-50/60 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">
                  {evt.title}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {evt.event_date
                    ? new Date(evt.event_date).toLocaleDateString()
                    : "Date to be announced"}
                </p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 capitalize">
                {evt.status || "active"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
