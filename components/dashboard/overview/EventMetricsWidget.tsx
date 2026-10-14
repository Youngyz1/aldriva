"use client";

import Link from "next/link";
import { Calendar, Heart, Users, DollarSign, Ticket, Star } from "lucide-react";
import type { EventMetrics, RecentEventSummary } from "@/lib/overview-types";

export interface EventMetricsWidgetProps {
  metrics: EventMetrics;
  recentEvents?: RecentEventSummary[];
  organizerId: string;
}

export function EventMetricsWidget({
  metrics,
  recentEvents,
  organizerId,
}: EventMetricsWidgetProps) {
  const base = `/dashboard/org/${organizerId}`;

  return (
    <section aria-labelledby="events-heading" className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-t border-zinc-200/80 pt-6">
        <h2 id="events-heading" className="text-sm font-black uppercase tracking-wider text-zinc-400">
          Events & Fundraisers
        </h2>
        <Link
          href={`${base}/events`}
          className="text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline"
        >
          View all events →
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={`${base}/events`}
          className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-orange-300 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950 tabular-nums">{metrics.totalEvents}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Events</p>
          </div>
        </Link>

        <Link
          href={`${base}/fundraisers`}
          className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Heart className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950 tabular-nums">{metrics.fundraisersCount}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Fundraisers</p>
          </div>
        </Link>

        <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950 tabular-nums">
              {metrics.followersCount.toLocaleString()}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Followers</p>
          </div>
        </div>

        <Link
          href={`${base}/fundraisers`}
          className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-purple-300 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950 tabular-nums">
              ${metrics.totalRaised.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Raised</p>
          </div>
        </Link>

        <Link
          href={`${base}/events`}
          className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-orange-300 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Ticket className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-zinc-950 tabular-nums">{metrics.ticketsSold}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tickets Sold</p>
          </div>
        </Link>

        {metrics.averageRating ? (
          <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-zinc-950 tabular-nums">
                ★ {Number(metrics.averageRating).toFixed(1)}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Avg Rating ({metrics.reviewCount ?? 0} reviews)
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Recent Events List */}
      {recentEvents && recentEvents.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden mt-4">
          <ul className="divide-y divide-zinc-100">
            {recentEvents.map((evt) => (
              <li key={evt.id} className="flex items-center justify-between gap-4 p-4 hover:bg-zinc-50 transition">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-zinc-900 truncate">{evt.title}</p>
                  <p className="text-xs text-zinc-500">
                    {evt.eventDate
                      ? new Date(evt.eventDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Date TBA"}
                    {evt.city ? ` · ${evt.city}` : ""}
                  </p>
                </div>
                <Link
                  href={`/dashboard/events/${evt.id}/overview`}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Manage →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
