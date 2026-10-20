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
  canQuickAdd?: boolean;
}

export interface CatalogCardProps {
  item: CatalogCardItem;
  onSelect?: (id: string, trigger?: HTMLButtonElement) => void;
  onQuickAdd?: (id: string, trigger: HTMLButtonElement) => void;
  className?: string;
  /** ISO 4217 currency code for price display (e.g. "XOF"). Defaults to "USD". */
  currency?: string;
  /** Locale for price formatting (e.g. "fr"). Defaults to "en". */
  locale?: "en" | "fr";
  /** How the menu item image fits its 4:3 container ('cover' | 'contain'). Defaults to 'cover'. */
  imageFit?: "cover" | "contain";
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

export function CatalogCard({ item, onSelect, onQuickAdd, className, currency = "USD", locale = "en", imageFit }: CatalogCardProps) {
  const content = (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-none shadow-none border-0 bg-[var(--tf-soft)] text-[var(--tf-on-soft)] ${className ?? ""}`}
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--tf-soft)] p-0">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.name}
            width={640}
            height={480}
            className={`h-full w-full ${imageFit === "contain" ? "object-contain" : "object-cover"}`}
            loading="lazy"
          />
        ) : (
          <InitialFallback name={item.name} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-[var(--v2-heading-font)] text-[18px] font-semibold leading-snug text-[var(--tf-on-soft)] line-clamp-2">
          {item.name}
        </h3>
        <p className="min-h-[2.5rem] text-[16px] text-[var(--tf-on-soft)]/90 line-clamp-2">
          {item.description || ""}
        </p>
        {item.priceLabel || item.numericPrice != null ? (
          <div className="mt-auto pt-1 text-[16px] font-semibold text-[var(--tf-on-soft)]">
            {item.priceLabel ??
              (typeof item.numericPrice === "number" && Number.isFinite(item.numericPrice)
                ? formatCurrency(item.numericPrice, currency, locale)
                : null)}
            {item.originalPriceLabel ? (
              <span className="ml-2 text-xs font-normal text-[var(--tf-on-soft)]/75 line-through">
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
      <div className="relative h-full">
        <button
          type="button"
          className="group flex h-full w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
          onClick={(event) => onSelect(item.id, event.currentTarget)}
          aria-label={item.name}
        >
          {content}
        </button>
        {item.canQuickAdd && onQuickAdd ? (
          <button type="button" aria-label={`Add ${item.name} to order`} onClick={(event) => onQuickAdd(item.id, event.currentTarget)} className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tf-border)] bg-[var(--tf-base)] text-lg font-semibold text-[var(--tf-on-base)] shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]">+</button>
        ) : null}
      </div>
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
  /** How the menu item image fits its 4:3 container ('cover' | 'contain'). Defaults to 'cover'. */
  imageFit?: "cover" | "contain";
  /** When set, cards render as buttons that call this handler on click. */
  onSelect?: (id: string, trigger?: HTMLButtonElement) => void;
  onQuickAdd?: (id: string, trigger: HTMLButtonElement) => void;
}

export function CatalogCarousel({ items, prevLabel, nextLabel, currency = "USD", locale = "en", imageFit = "cover", onSelect, onQuickAdd }: CatalogCarouselProps) {
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
          <div key={item.id} className="flex w-64 shrink-0 snap-start flex-col sm:w-72">
            <CatalogCard item={item} onSelect={onSelect} onQuickAdd={onQuickAdd} currency={currency} locale={locale} imageFit={imageFit} />
          </div>
        ))}
      </div>
    </div>
  );
}
