"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  IconSearch as Search,
  IconCar as Car,
  IconEdit as Edit,
} from "@tabler/icons-react";
import type { VehicleRow, VehicleStatus } from "@/lib/actions/vehicles";
import type { VehicleCategoryRow } from "@/lib/actions/rental-categories";
import { updateVehicleStatus } from "@/lib/actions/vehicles";
import { resolveVehicleCardStatus, type VehicleCardStatus } from "@/lib/fleet/vehicle-card-status";
import { formatMoney } from "@/lib/money";
import { vehicleLabel } from "@/lib/vehicle-label";

export interface VehicleBookingInfo {
  isActiveNow: boolean;
  freeUntil: string | null;
  nextBookingAt: string | null;
}

export interface FleetDirectoryClientProps {
  initialVehicles: VehicleRow[];
  categories: VehicleCategoryRow[];
  bookingInfoByVehicle: Record<string, VehicleBookingInfo>;
  organizerId: string;
  canManage: boolean;
}

const CARD_STATUS_CONFIG: Record<VehicleCardStatus, { label: string; bg: string; text: string }> = {
  available: { label: "Available", bg: "bg-emerald-500", text: "text-white" },
  rented: { label: "Out on rental", bg: "bg-blue-500", text: "text-white" },
  maintenance: { label: "Maintenance", bg: "bg-amber-500", text: "text-white" },
  inactive: { label: "Inactive", bg: "bg-zinc-500", text: "text-white" },
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function BookingFooterLine({ info }: { info?: VehicleBookingInfo }) {
  if (info?.isActiveNow && info.freeUntil) {
    return <span>Free from {formatShortDate(info.freeUntil)}</span>;
  }
  if (info?.nextBookingAt) {
    return <span>Next booking {formatShortDate(info.nextBookingAt)}</span>;
  }
  return <span>Free now</span>;
}

export function FleetDirectoryClient({
  initialVehicles,
  categories,
  bookingInfoByVehicle,
  organizerId,
  canManage,
}: FleetDirectoryClientProps) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>(initialVehicles);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filteredVehicles = vehicles.filter((v) => {
    if (selectedCategory !== "all" && v.category_id !== selectedCategory) {
      return false;
    }
    const cardStatus = resolveVehicleCardStatus(v, Boolean(bookingInfoByVehicle[v.id]?.isActiveNow));
    if (selectedStatus !== "all" && cardStatus !== selectedStatus) {
      return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchPlate = v.license_plate.toLowerCase().includes(q);
      const matchMake = v.make.toLowerCase().includes(q);
      const matchModel = v.model.toLowerCase().includes(q);
      if (!matchPlate && !matchMake && !matchModel) return false;
    }
    return true;
  });

  const handleStatusChange = (vehicleId: string, nextStatus: VehicleStatus) => {
    setUpdatingId(vehicleId);
    startTransition(async () => {
      const res = await updateVehicleStatus(vehicleId, organizerId, nextStatus);
      if (res.success) {
        setVehicles((prev) =>
          prev.map((v) => (v.id === vehicleId ? { ...v, status: nextStatus } : v))
        );
      }
      setUpdatingId(null);
    });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by make, model, or plate..."
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="h-10 appearance-none rounded-xl border border-zinc-200 bg-white px-3 pr-8 text-xs font-semibold text-zinc-700 hover:border-zinc-300 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filter by status"
              className="h-10 appearance-none rounded-xl border border-zinc-200 bg-white px-3 pr-8 text-xs font-semibold text-zinc-700 hover:border-zinc-300 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="rented">Out on Rental</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty Filter State */}
      {filteredVehicles.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <Car className="mx-auto h-8 w-8 text-zinc-300" />
          <h3 className="mt-2 text-sm font-bold text-zinc-900">No vehicles found</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {search || selectedCategory !== "all" || selectedStatus !== "all"
              ? "Try adjusting your search query or status filters."
              : "No physical vehicles registered in your fleet inventory yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredVehicles.map((v) => {
            const info = bookingInfoByVehicle[v.id];
            const cardStatus = resolveVehicleCardStatus(v, Boolean(info?.isActiveNow));
            const statusConfig = CARD_STATUS_CONFIG[cardStatus];
            const photoUrl = v.photo_url ?? v.category?.photo_url ?? null;

            return (
              <div
                key={v.id}
                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-md"
              >
                <Link
                  href={`/dashboard/org/${organizerId}/fleet/${v.id}`}
                  className="absolute inset-0 z-10"
                  aria-label={`View ${v.year} ${vehicleLabel(v.make, v.model)}, plate ${v.license_plate}`}
                />

                {/* Photo */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Car className="h-12 w-12 text-zinc-300" />
                    </div>
                  )}
                  <span
                    className={`absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${statusConfig.bg} ${statusConfig.text} shadow-sm`}
                  >
                    {statusConfig.label}
                  </span>
                  {canManage && (
                    <Link
                      href={`/dashboard/org/${organizerId}/fleet/${v.id}`}
                      aria-label={`Edit ${v.license_plate}`}
                      className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm transition hover:bg-white"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>

                {/* Body */}
                <div className="relative z-20 space-y-2 p-3.5 pointer-events-none">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 truncate">
                      {v.year} {vehicleLabel(v.make, v.model)}
                    </h3>
                    <p className="text-xs text-zinc-500 truncate">
                      {v.category?.name || "Uncategorized"}
                    </p>
                  </div>

                  <p className="text-base font-extrabold tabular-nums text-zinc-900">
                    {v.category ? formatMoney(v.category.daily_rate, v.category.currency) : "—"}
                    <span className="text-xs font-semibold text-zinc-400">/day</span>
                  </p>

                  <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono font-bold uppercase tracking-wider text-zinc-700">
                      {v.license_plate}
                    </span>
                    <BookingFooterLine info={info} />
                  </div>

                  {canManage && (
                    <div className="pointer-events-auto relative z-30 border-t border-zinc-100 pt-2">
                      <select
                        value={v.status}
                        disabled={isPending && updatingId === v.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleStatusChange(v.id, e.target.value as VehicleStatus);
                        }}
                        aria-label={`Update status for ${v.license_plate}`}
                        className="h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-600"
                      >
                        <option value="available">Available</option>
                        <option value="rented">Out on Rental</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="out_of_service">Inactive</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
