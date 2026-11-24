"use client";

/**
 * components/dashboard/BusinessSwitcher.tsx
 *
 * Interactive switcher for organizers operating multiple businesses.
 * Updates the persisted active business cookie and URL parameter.
 * Hidden automatically when the organizer has only one or zero businesses.
 */

import React, { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { IconBuildingStore as BuildingStore, IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { getActiveBusinessCookieName } from "@/lib/active-business";

export interface BusinessSwitcherProps {
  organizerId: string;
  businesses: ReadonlyArray<{
    id: string;
    name?: string | null;
    category?: string | null;
    business_type?: string | null;
  }>;
  activeBusinessId?: string | null;
  className?: string;
}

export function BusinessSwitcher({
  organizerId,
  businesses,
  activeBusinessId,
  className = "",
}: BusinessSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (!businesses || businesses.length <= 1) {
    return null;
  }

  const currentId = activeBusinessId || businesses[0]?.id;

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    if (!nextId || nextId === currentId) return;

    // 1. Persist to cookie (1 year duration)
    const cookieName = getActiveBusinessCookieName(organizerId);
    document.cookie = `${cookieName}=${encodeURIComponent(nextId)}; path=/; max-age=31536000; SameSite=Lax`;

    // 2. Update URL search parameter
    const params = new URLSearchParams(searchParams.toString());
    params.set("business", nextId);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
      router.refresh();
    });
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <label htmlFor={`business-switcher-${organizerId}`} className="sr-only">
        Active Business
      </label>
      <div className="relative flex items-center">
        <BuildingStore className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
        <select
          id={`business-switcher-${organizerId}`}
          value={currentId}
          onChange={handleSelect}
          disabled={isPending}
          aria-label="Switch active business"
          className="h-8 appearance-none rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-7 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 hover:border-zinc-300 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name || b.business_type || b.category || "Business"}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-zinc-400" />
      </div>
    </div>
  );
}
