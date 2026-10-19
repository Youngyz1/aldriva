"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { computeCarouselEnds } from "./ProductCarousel";
import { formatCurrency } from "@/lib/format-locale";

export interface CatalogCardItem {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  priceLabel?: string | null;
  numericPrice?: number | null;
  originalPriceLabel?: string | null;
  isSoldOut?: boolean;
  isFeatured?: boolean;
}

export interface CatalogCardProps {
  item: CatalogCardItem;
  onSelect?: (id: string) => void;
  className?: string;
  /** ISO 4217 currency code for price display (e.g. "XOF"). Defaults to "USD". */
  currency?: string;
  /** Locale for price formatting (e.g. "fr"). Defaults to "en". */
  locale?: "en" | "fr";
}

function InitialFallback({ name }: { name: string }) {
  const initial = name?.trim().charAt(0)?.toUpperCase() || "";
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--tf-soft)] text-[var(--tf-on-soft)]">
      {initial ? (
        <span className="font-[var(--v2-heading-font)] text-3xl font-bold">{initial}</span>
      ) : null}
    </div>
  );
}

export function CatalogCard({ item, onSelect, className, currency = "USD", locale = "en" }: CatalogCardProps) {
  const content = (
    <div
      className={`flex flex-col overflow-hidden rounded-none shadow-none border-0 bg-[var(--tf-soft)] text-[var(--tf-on-soft)] ${className ?? ""}`}
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--tf-soft)]">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <InitialFallback name={item.name} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-[var(--v2-heading-font)] text-base font-semibold leading-tight text-[var(--ps-text)] line-clamp-2">
          {item.name}
        </h3>
        {item.description ? (
          <p className="text-sm text-[var(--ps-muted)] line-clamp-2">{item.description}</p>
        ) : null}
        {item.priceLabel || item.numericPrice != null ? (
          <div className="mt-auto pt-2 text-sm font-semibold text-[var(--ps-text)]">
            {item.priceLabel ??
              (typeof item.numericPrice === "number" && Number.isFinite(item.numericPrice)
                ? formatCurrency(item.numericPrice, currency, locale)
                : null)}
            {item.originalPriceLabel ? (
              <span className="ml-1 text-xs font-normal text-[var(--ps-muted)] line-through">
                {item.originalPriceLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className="group text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
        onClick={() => onSelect(item.id)}
        aria-label={item.name}
      >
        {content}
      </button>
    );
  }

  return content;
}

export interface CatalogCarouselProps {
  items: CatalogCardItem[];
  prevLabel: string;
  nextLabel: string;
  /** ISO 4217 currency code for price display. */
  currency?: string;
  /** Locale for price formatting. */
  locale?: "en" | "fr";
  /** When set, cards render as buttons that call this handler on click. */
  onSelect?: (id: string) => void;
}

export function CatalogCarousel({ items, prevLabel, nextLabel, currency = "USD", locale = "en", onSelect }: CatalogCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ canPrev: false, canNext: true });

  const measure = useCallback(() => {
    const element = trackRef.current;
    if (!element) return;
    const next = computeCarouselEnds(element.scrollLeft, element.scrollWidth, element.clientWidth);
    setEnds(next);
  }, []);

  useEffect(() => {
    measure();
    const element = trackRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, items.length]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const element = trackRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = trackRef.current;
    if (!element) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByPage(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByPage(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      element.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={prevLabel}
        disabled={!ends.canPrev}
        onClick={() => scrollByPage(-1)}
        className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-[var(--tf-soft)] text-[var(--tf-on-soft)] opacity-90 shadow-xs transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={!ends.canNext}
        onClick={() => scrollByPage(1)}
        className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-[var(--tf-soft)] text-[var(--tf-on-soft)] opacity-90 shadow-xs transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] disabled:opacity-40"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 py-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <div key={item.id} className="w-64 shrink-0 snap-start sm:w-72">
            <CatalogCard item={item} onSelect={onSelect} currency={currency} locale={locale} />
          </div>
        ))}
      </div>
    </div>
  );
}
