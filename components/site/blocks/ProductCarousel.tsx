"use client";

/**
 * ProductCarousel — public-site snap-scroll card row.
 *
 * Layout reference only from the pasted shadcn-style example; this is a
 * purpose-built implementation: native scroll-snap (no carousel library),
 * Stage 1 `.public-site` role variables only, localized arrow labels, and
 * cards fed exclusively from server-resolved data (price labels
 * pre-formatted with formatMoney, stock badges from real stock state).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight, IconTag as Tag } from "@tabler/icons-react";

export interface ProductCarouselItem {
  id: string;
  href?: string | null;
  image?: string | null;
  name: string;
  description?: string | null;
  priceLabel?: string | null;
  badge?: string | null;
  badgeTone?: "muted" | "alert";
  /** When false with onAdd present, the quick-add button renders disabled. */
  canAdd?: boolean;
}

export interface ProductCarouselLabels {
  prev: string;
  next: string;
  region: string;
}

interface ProductCarouselProps {
  items: ProductCarouselItem[];
  labels: ProductCarouselLabels;
  /** Opt-in Store quick-add: renders an Add button per card (sibling of the
   * name link, never nested). Absent everywhere else. */
  onAdd?: (id: string) => void;
  addLabel?: string;
}

/**
 * Pure scroll-end computation (unit-tested): which arrows are active for a
 * scroll container. A 1px tolerance absorbs sub-pixel rounding.
 */
export function computeCarouselEnds(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  tolerance = 1
): { canPrev: boolean; canNext: boolean } {
  const overflowing = scrollWidth > clientWidth + tolerance;
  if (!overflowing) return { canPrev: false, canNext: false };
  return {
    canPrev: scrollLeft > tolerance,
    canNext: scrollLeft < scrollWidth - clientWidth - tolerance,
  };
}

function scrollByPage(element: HTMLElement, direction: -1 | 1): void {
  element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
}

export function ProductCarousel({ items, labels, onAdd, addLabel }: ProductCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ canPrev: false, canNext: false });
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const element = trackRef.current;
    if (!element) return;
    const next = computeCarouselEnds(element.scrollLeft, element.scrollWidth, element.clientWidth);
    setEnds(next);
    setOverflowing(next.canPrev || next.canNext || element.scrollWidth > element.clientWidth + 1);
  }, []);

  useEffect(() => {
    measure();
    const element = trackRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, items.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = trackRef.current;
    if (!element) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByPage(element, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByPage(element, 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      element.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
    }
  };

  if (items.length === 0) return null;

  const arrowButtonClass =
    "ps-button ps-button-secondary flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40";

  return (
    <div role="region" aria-roledescription="carousel" aria-label={labels.region}>
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-[var(--ps-space-4)] overflow-x-auto pb-[var(--ps-space-2)] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <article
            key={item.id}
            className="ps-card flex w-60 shrink-0 snap-start flex-col overflow-hidden sm:w-72"
          >
            <div className="relative aspect-[4/3] w-full bg-[var(--ps-neutral)]">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]"
                  aria-hidden="true"
                >
                  <Tag className="h-8 w-8" />
                </div>
              )}
              {item.badge ? (
                <span
                  className={`absolute left-[var(--ps-space-3)] top-[var(--ps-space-3)] rounded-lg border px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold ${
                    item.badgeTone === "alert"
                      ? "border-[var(--ps-error)] bg-[var(--ps-surface)] text-[var(--ps-error)]"
                      : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)]"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col p-[var(--ps-space-4)]">
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-sm font-semibold text-[var(--ps-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
                >
                  {item.name}
                </Link>
              ) : (
                <h3 className="text-sm font-semibold text-[var(--ps-text)]">{item.name}</h3>
              )}
              {item.description ? (
                <p className="mt-[var(--ps-space-1)] line-clamp-2 text-xs text-[var(--ps-muted)]">
                  {item.description}
                </p>
              ) : null}
              {item.priceLabel ? (
                <p className="mt-[var(--ps-space-2)] text-sm font-bold text-[var(--ps-text)]">
                  {item.priceLabel}
                </p>
              ) : null}
              {onAdd && addLabel ? (
                <button
                  type="button"
                  disabled={item.canAdd === false}
                  onClick={() => onAdd(item.id)}
                  aria-label={`${addLabel} — ${item.name}`}
                  className="ps-button ps-button-secondary mt-[var(--ps-space-3)] inline-flex min-h-11 w-full items-center justify-center disabled:opacity-40"
                >
                  {addLabel}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {overflowing ? (
        <div className="mt-[var(--ps-space-3)] flex items-center justify-end gap-[var(--ps-space-2)]">
          <button
            type="button"
            aria-label={labels.prev}
            disabled={!ends.canPrev}
            onClick={() => {
              const element = trackRef.current;
              if (element) scrollByPage(element, -1);
            }}
            className={arrowButtonClass}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={labels.next}
            disabled={!ends.canNext}
            onClick={() => {
              const element = trackRef.current;
              if (element) scrollByPage(element, 1);
            }}
            className={arrowButtonClass}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
