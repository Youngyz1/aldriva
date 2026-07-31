"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type PublicSearchBarProps = {
  action?: string;
  defaultQuery?: string;
  defaultLocation?: string;
  placeholder?: string;
  showLocation?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Mobile-only collapse-to-icon behavior. When true, the bar renders as a
   * single compact search pill below `sm`; tapping it reveals the full form
   * inline. Tablet/desktop (`sm:` and up) always show the full form. Default
   * false keeps every other usage (search page, homepage hero) unchanged.
   */
  collapsibleOnMobile?: boolean;
};

export default function PublicSearchBar({
  action = "/events",
  defaultQuery = "",
  defaultLocation = "",
  placeholder = "Search events, fundraisers, organizers…",
  showLocation = true,
  className,
  size = "md",
  collapsibleOnMobile = false,
}: PublicSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [location, setLocation] = useState(defaultLocation);
  // Start expanded when a search is already active so the user still sees and
  // can edit their terms instead of them hiding behind the collapsed icon.
  const [expanded, setExpanded] = useState(
    collapsibleOnMobile && Boolean(defaultQuery || defaultLocation)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const heightClass = size === "sm" ? "h-9" : size === "lg" ? "h-12" : "h-10";
  const textClass = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";

  // Collapse on outside tap / Escape while expanded (mobile only).
  useEffect(() => {
    if (!collapsibleOnMobile || !expanded) return;
    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setExpanded(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [collapsibleOnMobile, expanded]);

  // Focus the keyword field when the user expands the bar.
  useEffect(() => {
    if (collapsibleOnMobile && expanded) firstFieldRef.current?.focus();
  }, [collapsibleOnMobile, expanded]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (showLocation && location.trim()) params.set("location", location.trim());
    const qs = params.toString();
    router.push(`${action}${qs ? `?${qs}` : ""}`);
    setExpanded(false);
  }

  const fieldClass = cn(
    "w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20",
    heightClass,
    textClass
  );

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      {/* Collapsed mobile trigger — hidden on sm+ and while expanded. */}
      {collapsibleOnMobile && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={expanded}
          aria-label="Open search"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white pl-4 pr-5 font-bold text-zinc-500 shadow-sm transition hover:border-orange-300 hover:text-orange-600 sm:hidden",
            heightClass,
            textClass,
            expanded && "hidden"
          )}
        >
          <Search className="h-4 w-4" />
          <span>Search events</span>
        </button>
      )}

      <form
        onSubmit={onSubmit}
        className={cn(
          "w-full flex-col gap-2 sm:flex sm:flex-row sm:items-center",
          // sm+ always shows the full form. On mobile it shows only when
          // expanded (when collapsible); otherwise it is always visible.
          collapsibleOnMobile ? (expanded ? "flex" : "hidden sm:flex") : "flex"
        )}
      >
        {/* Keyword field + mobile collapse (X). On sm+ the X is hidden and this
            wrapper just holds the keyword field as a flex row item. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              ref={firstFieldRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className={fieldClass}
            />
          </label>
          {collapsibleOnMobile && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close search"
              className={cn(
                "inline-flex w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700 sm:hidden",
                heightClass
              )}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {showLocation && (
          <label className="relative min-w-0 sm:max-w-[200px] sm:flex-1 lg:max-w-[240px]">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City or location"
              className={fieldClass}
            />
          </label>
        )}
        <button
          type="submit"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-xl bg-orange-600 px-5 font-black text-white transition hover:bg-orange-700",
            // Full-width Search only in the mobile collapsed/expanded layout;
            // other usages keep the original content-width button on mobile.
            collapsibleOnMobile && "w-full sm:w-auto",
            heightClass,
            textClass
          )}
        >
          Search
        </button>
      </form>
    </div>
  );
}
