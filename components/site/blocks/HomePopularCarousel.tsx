"use client";

import { useState } from "react";
import { CatalogCard } from "./CatalogCard";
import { ItemDetailSheet } from "./StorefrontBrowse";
import type { ResolvedMenuItem } from "@/lib/website-embeds";
import type { BrowseItem } from "@/lib/storefront-browse";
import type { StorefrontBrowseLabels, StorefrontOrderConfig } from "./StorefrontBrowse";
import { formatCurrency } from "@/lib/format-locale";
import {
  createStorefrontCartLineId,
  loadStorefrontCart,
  saveStorefrontCart,
  upsertStorefrontCartLine,
  writeStorefrontCartSummary,
} from "@/lib/storefront-cart";

interface HomePopularCarouselProps {
  items: ResolvedMenuItem[];
  currency: string;
  locale: "en" | "fr";
  appearance: "default" | "showcase";
  showcaseLabels: { soldOut?: string; popular?: string; new?: string };
  siteSlug?: string;
  orderConfig: StorefrontOrderConfig | null | undefined;
  labels: StorefrontBrowseLabels;
  closeLabel: string;
}

/** Mirrors lib/storefront-browse.ts's availableBrowseOptionGroups check:
 * any option group with at least one available option blocks quick-add
 * (same rule the catalog page's own "+" uses), not just required groups. */
function hasQuickAddBlockingOptions(groups: ResolvedMenuItem["option_groups"]): boolean {
  if (!groups || groups.length === 0) return false;
  return groups.some((group) => group.options.some((option) => option.is_available !== false));
}

function mapItem(
  it: ResolvedMenuItem,
  currency: string,
  locale: "en" | "fr",
  freeDeliveryLabel: string,
  orderingEnabled: boolean
) {
  const effectivePrice = Number(it.effective_price ?? it.price);
  const originalPrice = Number(it.original_price ?? it.price);
  const isPromo = effectivePrice < originalPrice;
  const discountPercent = isPromo && originalPrice > 0 ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100) : 0;
  const isSoldOut = it.is_sold_out ?? false;
  return {
    id: it.id,
    name: it.name,
    description: it.description ?? null,
    image: it.image_url ?? null,
    priceLabel: formatCurrency(effectivePrice, currency, locale),
    numericPrice: effectivePrice,
    originalPriceLabel: isPromo ? formatCurrency(originalPrice, currency, locale) : null,
    discountLabel: discountPercent > 0 ? `-${discountPercent}%` : null,
    promotionEndsAt: it.applied_promotion?.ends_at ?? null,
    freeDeliveryLabel: it.applied_promotion?.offer_type === "free_delivery" ? freeDeliveryLabel : null,
    isSoldOut,
    isFeatured: it.is_featured ?? false,
    canQuickAdd: orderingEnabled && !isSoldOut && !hasQuickAddBlockingOptions(it.option_groups),
    isNew: it.is_new ?? false,
    isPopular: it.is_popular ?? false,
  };
}

export function HomePopularCarousel({
  items,
  currency,
  locale,
  appearance,
  showcaseLabels,
  siteSlug,
  orderConfig,
  labels,
  closeLabel,
}: HomePopularCarouselProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((it) => it.id === selectedId) ?? null;

  const priceLabel = selected
    ? formatCurrency(Number(selected.effective_price ?? selected.price), currency, locale)
    : null;

  const pricingItem: BrowseItem | undefined = selected
    ? {
        id: selected.id,
        name: selected.name,
        description: selected.description ?? null,
        image: selected.image_url ?? null,
        priceLabel: priceLabel ?? null,
        numericPrice: Number(selected.effective_price ?? selected.price),
        isSoldOut: selected.is_sold_out ?? false,
        tags: selected.dietary_tags,
        detailRows: [],
        optionGroups: [],
        isNew: selected.is_new ?? false,
        isPopular: selected.is_popular ?? false,
      }
    : undefined;

  // Up to 8 items, 2 columns mobile / 3 tablet / 4 desktop — same grid and
  // the same CatalogCard the catalog page itself uses.
  const orderingEnabled = Boolean(orderConfig?.enabled && !orderConfig.blocked);
  const gridItems = items.slice(0, 8).map((it) => mapItem(it, currency, locale, labels.freeDelivery ?? "Free delivery", orderingEnabled));

  // Quick-add: same cart (shared localStorage, keyed by site slug) and the
  // same "no sheet" behaviour as the catalog page's own "+". Items that need
  // a sheet (required/available options) never render a "+" at all — see
  // canQuickAdd above — so clicking the card opens the sheet instead, same
  // as the catalog.
  const handleQuickAdd = (itemId: string) => {
    if (!siteSlug) return;
    const found = gridItems.find((candidate) => candidate.id === itemId);
    if (!found || !found.canQuickAdd) return;
    const { lines: cart } = loadStorefrontCart(siteSlug);
    const { lines: nextCart } = upsertStorefrontCartLine(cart, {
      lineId: createStorefrontCartLineId(),
      itemId,
      selectedOptionIds: [],
      selectedOptions: [],
      quantity: 1,
    });
    saveStorefrontCart(siteSlug, nextCart);
    const count = nextCart.reduce((sum, line) => sum + line.quantity, 0);
    // Best-effort subtotal from items Home actually has price data for;
    // unresolved lines (e.g. added earlier from the full catalog with
    // options Home doesn't know) contribute 0. Safe: no UI reads this
    // subtotal today, only `.count` (tab bar / header cart badge).
    const subtotalCents = nextCart.reduce((sum, line) => {
      const priced = gridItems.find((candidate) => candidate.id === line.itemId);
      return priced ? sum + Math.round(priced.numericPrice * 100) * line.quantity : sum;
    }, 0);
    writeStorefrontCartSummary(siteSlug, count, subtotalCents, orderConfig?.currency || currency || "USD");
  };

  return (
    <div className="space-y-[var(--ps-space-4)]">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {gridItems.map((item) => (
          <CatalogCard
            key={item.id}
            item={item}
            onSelect={(id) => setSelectedId(id)}
            onQuickAdd={(id) => handleQuickAdd(id)}
            currency={currency}
            locale={locale}
            imageFit="cover"
            appearance={appearance}
            showcaseLabels={showcaseLabels}
            siteSlug={siteSlug}
          />
        ))}
      </div>
      {selected ? (
        <ItemDetailSheet
          key={selected.id}
          itemId={selected.id}
          title={selected.name}
          image={selected.image_url ?? null}
          description={selected.description ?? null}
          priceLabel={priceLabel ?? null}
          numericPrice={Number(selected.effective_price ?? selected.price)}
          pricingItem={pricingItem}
          isSoldOut={selected.is_sold_out ?? false}
          optionGroups={[]}
          tags={selected.dietary_tags}
          detailRows={[]}
          action={undefined}
          tableFlame={false}
          savannah={false}
          appearance={appearance}
          closeLabel={closeLabel}
          labels={labels}
          orderConfig={orderConfig ?? undefined}
          locale={locale}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
