/**
 * components/dashboard/overview/modules/BookingsSection.tsx
 *
 * Real tenant-scoped Bookings & Appointments operational section.
 * Reads public.reservations where booking_type = 'appointment' (or general reservations).
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatTimeInTimezone } from "@/lib/date-timezone";
import { StatCard } from "../StatCard";
import { StatusChip } from "../StatusChip";
import { EmptyState } from "../EmptyState";
import {
  IconCalendarCheck as CalendarCheck,
  IconClock as Clock,
  IconArrowRight as ArrowRight,
  IconPlus as Plus,
} from "@tabler/icons-react";

export interface BookingsSectionProps {
  organizerId: string;
  fromIso: string;
  toIso: string;
  timezone: string;
  canManage?: boolean;
}

interface ReservationRow {
  id: string;
  reservation_number: string;
  customer_name: string;
  customer_phone: string;
  starts_at: string;
  status: string;
  party_size: number;
  booking_type: string;
  booking_details?: Record<string, unknown> | null;
}

export async function BookingsSection({
  organizerId,
  fromIso,
  toIso,
  timezone,
  canManage = true,
}: BookingsSectionProps) {
  const supabase = createSupabaseAdmin();

  // Tenant-scoped queries with error-safe fallback
  let rows: ReservationRow[] = [];
  let pendingCount = 0;
  let confirmedCount = 0;
  let periodCount = 0;

  try {
    const [periodRes, pendingRes] = await Promise.all([
      // Reservations within period
      supabase
        .from("reservations")
        .select("id, reservation_number, customer_name, customer_phone, starts_at, status, party_size, booking_type, booking_details")
        .eq("organizer_id", organizerId)
        .in("booking_type", ["appointment", "table"])
        .gte("starts_at", fromIso)
        .lte("starts_at", toIso)
        .order("starts_at", { ascending: true })
        .limit(20),

      // Pending action count
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId)
        .eq("status", "pending"),
    ]);

    if (!periodRes.error && Array.isArray(periodRes.data)) {
      rows = periodRes.data as ReservationRow[];
      periodCount = rows.length;
      confirmedCount = rows.filter((r) => r.status === "confirmed" || r.status === "seated").length;
    }
    pendingCount = pendingRes.count ?? 0;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[BookingsSection] query error:", err);
    }
  }

  const upcomingRows = rows.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Bookings & Appointments
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link
              href={`/dashboard/org/${organizerId}/reservations`}
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* KPI Tiles Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Scheduled"
          value={periodCount}
          format="count"
          href={`/dashboard/org/${organizerId}/reservations`}
        />
        <StatCard
          label="Confirmed"
          value={confirmedCount}
          format="count"
        />
        <StatCard
          label="Pending Approval"
          value={pendingCount}
          format="count"
          hint={pendingCount > 0 ? "Requires confirmation" : undefined}
          href={`/dashboard/org/${organizerId}/reservations?status=pending`}
        />
      </div>

      {/* Upcoming List or In-place Empty State */}
      {upcomingRows.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No bookings scheduled in this period."
          action={{
            label: "Open Bookings",
            href: `/dashboard/org/${organizerId}/reservations`,
          }}
          icon={Clock}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {upcomingRows.map((item) => {
            const timeStr = formatTimeInTimezone(item.starts_at, timezone);
            const dateStr = new Date(item.starts_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            const details = item.booking_details || {};
            const serviceName =
              typeof details.service_type === "string" ? details.service_type : null;

            return (
              <div
                key={item.id}
                className="min-h-[52px] flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-50/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-center shrink-0 w-12 py-1 rounded bg-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">{dateStr}</p>
                    <p className="text-xs font-bold text-zinc-900 tabular-nums">{timeStr}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">
                      {item.customer_name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {serviceName ? `${serviceName} · ` : ""}
                      {item.party_size > 1 ? `${item.party_size} guests` : "1 guest"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip domain="booking" value={item.status} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
