"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight } from "@tabler/icons-react";
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
  discountLabel?: string | null;
  promotionEndsAt?: string | null;
  freeDeliveryLabel?: string | null;
  isSoldOut?: boolean;
  isFeatured?: boolean;
  canQuickAdd?: boolean;
  /** Server-computed: true when created within 14 days. Never use Date.now() during render. */
  isNew?: boolean;
  /** Server-computed: products with "popular" tag, menu items with is_featured. */
  isPopular?: boolean;
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
  /** Card visual style. "default" matches Savannah (no border, no radius, no shadow). "showcase" uses --tf-card, border, radius, badges. */
  appearance?: "default" | "showcase";
  /** Labels for showcase badges and sold-out state. */
  showcaseLabels?: {
    soldOut?: string;
    popular?: string;
    new?: string;
  };
}

export function hasCatalogCarouselOverflow(scrollWidth: number, clientWidth: number, tolerance = 1): boolean {
  return scrollWidth > clientWidth + tolerance;
}

function formatPromotionEndDate(value: string | null | undefined, locale: "en" | "fr"): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const dateLabel = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return "Ends " + dateLabel;
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

/** Resolve the single showcase badge to display, in strict priority order. */
function resolveShowcaseBadge(
  item: CatalogCardItem,
  labels: CatalogCardProps["showcaseLabels"],
): { label: string; tone: "accent" | "muted" } | null {
  // 1. Discount badge (highest priority)
  if (item.discountLabel) return { label: item.discountLabel, tone: "accent" };
  // 2. Popular
  if (item.isPopular) return { label: labels?.popular ?? "Popular", tone: "muted" };
  // 3. New
  if (item.isNew) return { label: labels?.new ?? "New", tone: "muted" };
  return null;
}

export function CatalogCard({ item, onSelect, onQuickAdd, className, currency = "USD", locale = "en", imageFit, appearance, showcaseLabels }: CatalogCardProps) {
  const isShowcase = appearance === "showcase";
  const effectivePriceLabel = typeof item.numericPrice === "number" && Number.isFinite(item.numericPrice)
    ? formatCurrency(item.numericPrice, currency, locale)
    : item.priceLabel;
  const promotionEndLabel = formatPromotionEndDate(item.promotionEndsAt, locale);
  const badge = isShowcase ? resolveShowcaseBadge(item, showcaseLabels) : null;
  const isSoldOut = Boolean(item.isSoldOut);
  const content = isShowcase ? (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-xl border border-[var(--tf-border)] bg-[var(--tf-card)] text-[var(--tf-ink)] ${isSoldOut ? "opacity-60" : ""} ${className ?? ""}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--tf-soft)] p-0">
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
        {badge ? (
          <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${badge.tone === "accent" ? "bg-[var(--tf-accent)] text-[var(--tf-on-accent)]" : "bg-[var(--tf-soft)] text-[var(--tf-on-soft)]"}`}>
            {badge.label}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-[var(--v2-heading-font)] text-[16px] font-semibold leading-snug text-[var(--tf-ink)] line-clamp-2">
          {item.name}
        </h3>
        {item.description ? (
          <p className="text-[14px] text-[var(--tf-muted)] line-clamp-2">
            {item.description}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-1">
          {isSoldOut ? (
            <span className="text-[14px] font-semibold text-[var(--tf-muted)]">
              {showcaseLabels?.soldOut ?? "Sold out"}
            </span>
          ) : (
            <>
              {item.originalPriceLabel ? (
                <span className="text-[13px] font-normal text-[var(--tf-muted)] line-through">
                  {item.originalPriceLabel}
                </span>
              ) : null}
              {effectivePriceLabel ? (
                <span className={`text-[16px] font-bold ${item.originalPriceLabel ? "text-[var(--tf-accent)]" : "text-[var(--tf-ink)]"}`}>
                  {effectivePriceLabel}
                </span>
              ) : null}
            </>
          )}
        </div>
        {!isSoldOut && (item.freeDeliveryLabel || promotionEndLabel) ? (
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
            {item.freeDeliveryLabel ? <span className="rounded-full bg-[var(--tf-accent)] px-2 py-0.5 font-semibold text-[var(--tf-on-accent)]">{item.freeDeliveryLabel}</span> : null}
            {promotionEndLabel ? <span className="text-[var(--tf-muted)]">{promotionEndLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : (
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
        {effectivePriceLabel || item.originalPriceLabel ? (
          <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-1 text-[16px] font-semibold text-[var(--tf-on-soft)]">
            {item.originalPriceLabel ? (
              <span className="text-xs font-normal text-[var(--tf-on-soft)]/75 line-through">
                {item.originalPriceLabel}
              </span>
            ) : null}
            {effectivePriceLabel ? (
              <span className={item.originalPriceLabel ? "text-[var(--ps-accent-hover)]" : undefined}>
                {effectivePriceLabel}
              </span>
            ) : null}
            {item.discountLabel ? <span className="rounded-full bg-[var(--ps-accent)] px-2 py-1 text-[11px] font-bold leading-none text-[var(--ps-accent-foreground)]">{item.discountLabel}</span> : null}
          </div>
        ) : null}
        {item.freeDeliveryLabel || promotionEndLabel ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {item.freeDeliveryLabel ? <span className="rounded-full bg-[var(--ps-accent)] px-2 py-1 font-semibold text-[var(--ps-accent-foreground)]">{item.freeDeliveryLabel}</span> : null}
            {promotionEndLabel ? <span className="text-[var(--tf-on-soft)]/75">{promotionEndLabel}</span> : null}
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
          className={`group flex h-full w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${isShowcase ? "focus-visible:outline-[var(--tf-accent)]" : "focus-visible:outline-[var(--ps-accent-hover)]"}`}
          onClick={(event) => onSelect(item.id, event.currentTarget)}
          aria-label={item.name}
          disabled={isShowcase && isSoldOut}
        >
          {content}
        </button>
        {(isShowcase ? !isSoldOut && item.canQuickAdd : item.canQuickAdd) && onQuickAdd ? (
          <button type="button" aria-label={`Add ${item.name} to order`} onClick={(event) => onQuickAdd(item.id, event.currentTarget)} className={isShowcase ? "absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--tf-border)] bg-[var(--tf-card)] text-base font-semibold text-[var(--tf-ink)] shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]" : "absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tf-border)] bg-[var(--tf-base)] text-lg font-semibold text-[var(--tf-on-base)] shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"}>+</button>
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
  /** Card visual style passed through to CatalogCard. */
  appearance?: "default" | "showcase";
  /** Badge labels passed through to CatalogCard. */
  showcaseLabels?: CatalogCardProps["showcaseLabels"];
}

export function CatalogCarousel({ items, prevLabel, nextLabel, currency = "USD", locale = "en", imageFit = "cover", onSelect, onQuickAdd, appearance, showcaseLabels }: CatalogCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ canPrev: false, canNext: false });
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const element = trackRef.current;
    if (!element) return;
    const next = computeCarouselEnds(element.scrollLeft, element.scrollWidth, element.clientWidth);
    setEnds(next);
    setOverflowing(hasCatalogCarouselOverflow(element.scrollWidth, element.clientWidth));
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
      {overflowing ? <button
        type="button"
        aria-label={prevLabel}
        disabled={!ends.canPrev}
        onClick={() => scrollByPage(-1)}
        className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-[var(--tf-soft)] text-[var(--tf-on-soft)] opacity-90 shadow-xs transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" />
      </button> : null}
      {overflowing ? <button
        type="button"
        aria-label={nextLabel}
        disabled={!ends.canNext}
        onClick={() => scrollByPage(1)}
        className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-[var(--tf-soft)] text-[var(--tf-on-soft)] opacity-90 shadow-xs transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] disabled:opacity-40"
      >
        <ChevronRight className="h-5 w-5" />
      </button> : null}
      <div
        ref={trackRef}
        tabIndex={overflowing ? 0 : undefined}
        onKeyDown={handleKeyDown}
        onScroll={measure}
        className={overflowing ? "flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 py-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] [&::-webkit-scrollbar]:hidden" : "flex gap-4 overflow-x-hidden px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}
      >
        {items.map((item) => (
          <div key={item.id} className={overflowing ? "flex w-64 shrink-0 snap-start flex-col sm:w-72" : "flex w-64 shrink-0 flex-col sm:w-72"}>
            <CatalogCard item={item} onSelect={onSelect} onQuickAdd={onQuickAdd} currency={currency} locale={locale} imageFit={imageFit} appearance={appearance} showcaseLabels={showcaseLabels} />
          </div>
        ))}
      </div>
    </div>
  );
}
