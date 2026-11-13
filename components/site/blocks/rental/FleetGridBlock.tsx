"use client";

import { useState, useMemo } from "react";
import {
  IconSearch as SearchIcon,
  IconFilter as FilterIcon,
} from "@tabler/icons-react";
import type { StorefrontRentalConfig } from "./types";
import { FleetCard } from "./FleetCardsBlock";

interface FleetGridBlockProps {
  rentalConfig?: StorefrontRentalConfig;
  siteSlug?: string;
  heading?: string;
  subheading?: string;
}

export function FleetGridBlock({
  rentalConfig,
  siteSlug,
  heading = "Explore Our Fleet",
  subheading = "Filter by passenger capacity and transmission to find your perfect vehicle.",
}: FleetGridBlockProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTransmission, setSelectedTransmission] = useState<string>("all");
  const [selectedSeats, setSelectedSeats] = useState<string>("all");

  const categories = rentalConfig?.categories;
  const currency = rentalConfig?.currency || "USD";
  const confirmationMode = rentalConfig?.settings?.confirmationMode || "approval";

  const filteredCategories = useMemo(() => {
    const list = categories || [];
    return list.filter((cat) => {
      // Search text
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = cat.name.toLowerCase().includes(query);
        const matchesDesc = (cat.description || "").toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // Transmission
      if (selectedTransmission !== "all") {
        const trans = (cat.specs?.transmission || "automatic").toLowerCase();
        if (trans !== selectedTransmission) return false;
      }

      // Seats
      if (selectedSeats !== "all") {
        const seats = Number(cat.specs?.seats) || 5;
        const minSeats = parseInt(selectedSeats, 10);
        if (seats < minSeats) return false;
      }

      return true;
    });
  }, [categories, searchQuery, selectedTransmission, selectedSeats]);

  if (!rentalConfig?.enabled) {
    return null;
  }

  return (
    <section id="fleet-catalog" className="w-full py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {heading}
        </h2>
        {subheading && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subheading}
          </p>
        )}
      </div>

      {/* Filter Bar */}
      <div className="mb-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        {/* Search Input */}
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search make, model, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-700 focus:border-brand-700"
          />
        </div>

        {/* Transmission & Seats Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
            <FilterIcon className="h-4 w-4" />
            <span>Filter:</span>
          </div>

          <select
            value={selectedTransmission}
            onChange={(e) => setSelectedTransmission(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand-700"
          >
            <option value="all">All Transmissions</option>
            <option value="automatic">Automatic Only</option>
            <option value="manual">Manual Only</option>
          </select>

          <select
            value={selectedSeats}
            onChange={(e) => setSelectedSeats(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand-700"
          >
            <option value="all">All Seating Capacities</option>
            <option value="4">4+ Passengers</option>
            <option value="5">5+ Passengers</option>
            <option value="7">7+ Passengers</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {filteredCategories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            No vehicle categories match your filters.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Try resetting your search query or seat filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedTransmission("all");
              setSelectedSeats("all");
            }}
            className="mt-4 inline-flex items-center text-xs font-semibold text-brand-700 underline"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {filteredCategories.map((cat) => (
            <FleetCard
              key={cat.id}
              category={cat}
              currency={currency}
              confirmationMode={confirmationMode}
              siteSlug={siteSlug}
            />
          ))}
        </div>
      )}
    </section>
  );
}
