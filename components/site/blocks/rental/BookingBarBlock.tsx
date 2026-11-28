"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconCalendar as CalendarIcon,
  IconMapPin as MapPinIcon,
  IconClock as ClockIcon,
  IconSearch as SearchIcon,
} from "@tabler/icons-react";
import type { StorefrontRentalConfig } from "./types";

interface BookingBarBlockProps {
  rentalConfig?: StorefrontRentalConfig;
  siteSlug?: string;
  heading?: string;
  subheading?: string;
}

export function BookingBarBlock({
  rentalConfig,
  siteSlug,
  heading,
  subheading,
}: BookingBarBlockProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize dates: default to tomorrow 10:00 AM -> 3 days later 10:00 AM
  const defaultStart = new Date(Date.now() + 86400000);
  defaultStart.setHours(10, 0, 0, 0);
  const defaultEnd = new Date(Date.now() + 86400000 * 4);
  defaultEnd.setHours(10, 0, 0, 0);

  const initialStartDate = searchParams.get("startDate") || defaultStart.toISOString().slice(0, 10);
  const initialStartTime = searchParams.get("startTime") || "10:00";
  const initialEndDate = searchParams.get("endDate") || defaultEnd.toISOString().slice(0, 10);
  const initialEndTime = searchParams.get("endTime") || "10:00";

  const defaultBranchId = rentalConfig?.branches[0]?.id || "";
  const initialPickupBranch = searchParams.get("pickupBranch") || defaultBranchId;
  const initialReturnBranch = searchParams.get("returnBranch") || defaultBranchId;

  const [startDate, setStartDate] = useState(initialStartDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [pickupBranch, setPickupBranch] = useState(initialPickupBranch);
  const [returnBranch, setReturnBranch] = useState(initialReturnBranch);
  const [differentReturn, setDifferentReturn] = useState(initialPickupBranch !== initialReturnBranch);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("startDate", startDate);
    params.set("startTime", startTime);
    params.set("endDate", endDate);
    params.set("endTime", endTime);
    params.set("pickupBranch", pickupBranch);
    params.set("returnBranch", differentReturn ? returnBranch : pickupBranch);

    const targetUrl = siteSlug ? `/site/${siteSlug}/fleet?${params.toString()}` : `?${params.toString()}#fleet-catalog`;
    router.push(targetUrl);
  };

  if (!rentalConfig?.enabled) {
    return null;
  }

  const branches = rentalConfig.branches || [];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {heading && (
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">
            {heading}
          </h2>
        )}
        {subheading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
            {subheading}
          </p>
        )}

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Pickup Branch */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                <MapPinIcon className="h-4 w-4 text-brand-700" />
                Pickup Location
              </label>
              <select
                value={pickupBranch}
                onChange={(e) => {
                  setPickupBranch(e.target.value);
                  if (!differentReturn) {
                    setReturnBranch(e.target.value);
                  }
                }}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {branches.length === 0 ? (
                  <option value="">Main Depot</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} {b.city ? `(${b.city})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Pickup Date & Time */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                <CalendarIcon className="h-4 w-4 text-brand-700" />
                Pickup Date & Time
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-3/5 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-2/5 rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Return Date & Time */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                <ClockIcon className="h-4 w-4 text-brand-700" />
                Return Date & Time
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-3/5 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-2/5 rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Search Action */}
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2 transition"
              >
                <SearchIcon className="h-4 w-4" />
                Search Available Fleet
              </button>
            </div>
          </div>

          {/* Return to different location toggle */}
          {branches.length > 1 && (
            <div className="pt-2">
              <div className="flex items-center gap-2">
                <input
                  id="differentReturn"
                  type="checkbox"
                  checked={differentReturn}
                  onChange={(e) => {
                    setDifferentReturn(e.target.checked);
                    if (!e.target.checked) {
                      setReturnBranch(pickupBranch);
                    }
                  }}
                  className="h-4 w-4 rounded border-zinc-300 text-brand-700 focus:ring-brand-700 dark:border-zinc-700"
                />
                <label
                  htmlFor="differentReturn"
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer"
                >
                  Return to a different location
                </label>
              </div>

              {differentReturn && (
                <div className="mt-3 max-w-xs">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                    Return Location
                  </label>
                  <select
                    value={returnBranch}
                    onChange={(e) => setReturnBranch(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} {b.city ? `(${b.city})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
