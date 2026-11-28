"use client";

/**
 * components/dashboard/rentals/BookingListClient.tsx
 *
 * Client component for the rental bookings list — handles tab filtering,
 * search, and row rendering. Called from app/dashboard/org/[id]/rentals/page.tsx.
 * Mobile-first. docs/design/rental/architecture.md Decision 10.
 */

import { vehicleLabel } from "@/lib/vehicle-label";
import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  IconCar as Car,
  IconSearch as Search,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { RentalBookingStatusBadge, type RentalBookingStatus } from "./RentalBookingStatusBadge";

export interface BookingListRow {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_email: string;
  starts_at: string;
  ends_at: string;
  status: RentalBookingStatus;
  is_overdue: boolean;
  source: "online" | "office";
  rental_amount: number;
  snapshot_currency: string;
  vehicle_id: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_plate?: string | null;
  category_name?: string | null;
}

type TabKey = "all" | "pending" | "active" | "completed" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface BookingListClientProps {
  bookings: BookingListRow[];
  organizerId: string;
  canManage: boolean;
  initialTab?: TabKey;
}

export function BookingListClient({
  bookings,
  organizerId,
  initialTab = "all",
}: BookingListClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const filtered = useMemo(() => {
    let rows = bookings;
    if (activeTab !== "all") {
      rows = rows.filter((b) => {
        if (activeTab === "pending") return b.status === "pending" || b.status === "awaiting_payment" || b.status === "confirmed";
        if (activeTab === "cancelled") return b.status === "cancelled" || b.status === "expired" || b.status === "no_show";
        return b.status === activeTab;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (b) =>
          b.booking_number.toLowerCase().includes(q) ||
          b.customer_name.toLowerCase().includes(q) ||
          b.customer_email.toLowerCase().includes(q) ||
          (b.vehicle_plate ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [bookings, activeTab, search]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: bookings.length, pending: 0, active: 0, completed: 0, cancelled: 0 };
    for (const b of bookings) {
      if (b.status === "pending" || b.status === "awaiting_payment" || b.status === "confirmed") counts.pending++;
      else if (b.status === "active") counts.active++;
      else if (b.status === "completed") counts.completed++;
      else if (b.status === "cancelled" || b.status === "expired" || b.status === "no_show") counts.cancelled++;
    }
    return counts;
  }, [bookings]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search bookings, customer, plate…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
          aria-label="Search bookings"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 h-8 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-brand-700 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className="ml-1.5 text-[10px] opacity-80">({tabCounts[tab.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Booking rows */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Car className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="text-sm font-semibold text-zinc-500">No bookings found</p>
          <p className="text-xs text-zinc-400">
            {search ? "Try adjusting your search" : "Create a new booking to get started"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 -mx-4 sm:mx-0 sm:border sm:border-zinc-200 sm:rounded-xl sm:overflow-hidden">
          {filtered.map((booking) => (
            <Link
              key={booking.id}
              href={`/dashboard/org/${organizerId}/rentals/${booking.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3.5 bg-white hover:bg-zinc-50/80 transition group"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-zinc-900 font-mono">
                    {booking.booking_number}
                  </span>
                  <RentalBookingStatusBadge status={booking.status} isOverdue={booking.is_overdue} />
                  {booking.source === "online" && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                      Online
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-700 font-medium truncate">{booking.customer_name}</p>
                <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                  <span>{formatDate(booking.starts_at)}</span>
                  <span>→</span>
                  <span>{formatDate(booking.ends_at)}</span>
                  {booking.vehicle_make && (
                    <span className="text-zinc-400">·</span>
                  )}
                  {booking.vehicle_make ? (
                    <span className="text-zinc-500">
                      {vehicleLabel(booking.vehicle_make, booking.vehicle_model)}
                      {booking.vehicle_plate ? ` (${booking.vehicle_plate})` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium">Unassigned</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-zinc-900 tabular-nums">
                  {formatAmount(booking.rental_amount, booking.snapshot_currency)}
                </span>
                <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
