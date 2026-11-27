"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconSearch, IconAdjustments } from "@tabler/icons-react";

export interface ShowcaseSortOption {
  value: string;
  label: string;
}

export interface ShowcaseSearchBarProps {
  catalogHref: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filterAriaLabel: string;
  sortLabel: string;
  sortOptions: ShowcaseSortOption[];
}

/**
 * Search field with the filter control merged into its right end. Opens a
 * small sheet with sort options — categories are not included here: on the
 * Home page the catalog's category list is only resolved inside the Popular/
 * Catalog section's own server render, so showing it here would mean an
 * extra live catalog resolution on every Home load. "Browse by category"
 * (tiles, further down Home) is the cheap, already-resolved path to the same
 * destination instead.
 */
export function ShowcaseSearchBar({
  catalogHref,
  searchPlaceholder,
  searchAriaLabel,
  filterAriaLabel,
  sortLabel,
  sortOptions,
}: ShowcaseSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <form action={catalogHref} method="GET" role="search" aria-label={searchAriaLabel} className="relative w-full">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tf-muted)]" aria-hidden="true" />
        <input
          type="search"
          name="q"
          placeholder={searchPlaceholder}
          className="h-11 w-full min-h-[44px] rounded-full border border-[var(--tf-border)] bg-[var(--tf-card)] pl-11 pr-14 text-sm text-[var(--tf-ink)] placeholder:text-[var(--tf-muted)] shadow-none focus:outline-none focus:ring-2 focus:ring-[var(--tf-accent)]"
        />
        <button
          type="button"
          aria-label={filterAriaLabel}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 min-h-[36px] min-w-[36px] -translate-y-1/2 items-center justify-center rounded-full text-[var(--tf-muted)] hover:bg-[var(--tf-soft)] hover:text-[var(--tf-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
        >
          <IconAdjustments className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      {isOpen ? (
        <div
          ref={sheetRef}
          role="dialog"
          aria-label={sortLabel}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-card)] p-2 shadow-lg"
        >
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--tf-muted)]">{sortLabel}</p>
          <ul>
            {sortOptions.map((option) => (
              <li key={option.value}>
                <a
                  href={`${catalogHref}?sort=${encodeURIComponent(option.value)}`}
                  className="block min-h-[36px] rounded-lg px-2 py-2 text-sm text-[var(--tf-ink)] hover:bg-[var(--tf-soft)]"
                >
                  {option.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
