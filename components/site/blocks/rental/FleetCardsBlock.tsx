"use client";

import Link from "next/link";
import {
  IconUsers as UsersIcon,
  IconManualGearbox as TransmissionIcon,
  IconGasStation as FuelIcon,
  IconSnowflake as AcIcon,
  IconShieldCheck as ShieldIcon,
  IconArrowRight as ArrowRightIcon,
} from "@tabler/icons-react";
import type { StorefrontRentalConfig } from "./types";
import type { PublicRentalCategory } from "@/lib/actions/rental-public";

interface FleetCardsBlockProps {
  rentalConfig?: StorefrontRentalConfig;
  siteSlug?: string;
  heading?: string;
  subheading?: string;
}

export function FleetCardsBlock({
  rentalConfig,
  siteSlug,
  heading = "Featured Vehicle Fleet",
  subheading = "Choose from our fleet of clean, reliable, and fuel-efficient vehicles.",
}: FleetCardsBlockProps) {
  if (!rentalConfig?.enabled || !rentalConfig.categories.length) {
    return null;
  }

  const categories = rentalConfig.categories.slice(0, 6);
  const currency = rentalConfig.currency || "USD";
  const confirmationMode = rentalConfig.settings.confirmationMode;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {heading}
        </h2>
        {subheading && (
          <p className="mt-2 text-sm sm:text-base text-zinc-500 dark:text-zinc-400">
            {subheading}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {categories.map((cat) => (
          <FleetCard
            key={cat.id}
            category={cat}
            currency={currency}
            confirmationMode={confirmationMode}
            siteSlug={siteSlug}
          />
        ))}
      </div>
    </section>
  );
}

export function FleetCard({
  category,
  currency,
  confirmationMode,
  siteSlug,
}: {
  category: PublicRentalCategory;
  currency: string;
  confirmationMode: "approval" | "instant";
  siteSlug?: string;
}) {
  const specs = category.specs || {};
  const bookHref = siteSlug
    ? `/site/${siteSlug}/book?category=${category.id}`
    : `?category=${category.id}#rental-booking-form`;

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs hover:shadow-md transition dark:border-zinc-800 dark:bg-zinc-900">
      {/* Category Photo */}
      <div className="relative aspect-16/10 w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        {category.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={category.photoUrl}
            alt={category.name}
            className="h-full w-full object-cover object-center group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">
            <span className="text-xs uppercase tracking-wider font-semibold">No photo available</span>
          </div>
        )}

        {/* Status chip */}
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-xs px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-xs dark:bg-zinc-900/90 dark:text-brand-400">
            <ShieldIcon className="h-3.5 w-3.5" />
            {confirmationMode === "instant" ? "Instant Booking" : "Online Request"}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {category.name}
            </h3>
            {category.description && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                {category.description}
              </p>
            )}
          </div>
        </div>

        {/* Specs Badges */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-300 border-t border-b border-zinc-100 dark:border-zinc-800/80 py-3 mb-4">
          <div className="flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>{specs.seats ? `${specs.seats} Seats` : "4-5 Seats"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TransmissionIcon className="h-4 w-4 text-zinc-400 shrink-0" />
            <span className="capitalize">{specs.transmission || "Automatic"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FuelIcon className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>Full-to-Full</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AcIcon className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>{specs.ac !== false ? "Air Conditioning" : "Standard Climate"}</span>
          </div>
        </div>

        {/* Price & Booking Action */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                ${category.dailyRate.toFixed(2)}
              </span>
              <span className="text-xs text-zinc-500">{currency} / day</span>
            </div>
            {category.weeklyRate && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                ${category.weeklyRate.toFixed(2)} / week
              </p>
            )}
          </div>

          <Link
            href={bookHref}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 transition"
          >
            <span>Book</span>
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
