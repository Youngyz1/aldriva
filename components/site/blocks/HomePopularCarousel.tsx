"use client";

import { useState } from "react";
import { CatalogCard } from "./CatalogCard";
import { ItemDetailSheet } from "./StorefrontBrowse";
import type { ResolvedMenuItem } from "@/lib/website-embeds";
import type { BrowseItem } from "@/lib/storefront-browse";
import type { StorefrontBrowseLabels, StorefrontOrderConfig } from "./StorefrontBrowse";
import { formatCurrency } from "@/lib/format-locale";

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

function mapItem(it: ResolvedMenuItem, currency: string, locale: "en" | "fr", freeDeliveryLabel: string) {
  const effectivePrice = Number(it.effective_price ?? it.price);
  const originalPrice = Number(it.original_price ?? it.price);
  const isPromo = effectivePrice < originalPrice;
  const discountPercent = isPromo && originalPrice > 0 ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100) : 0;
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
    isSoldOut: it.is_sold_out ?? false,
    isFeatured: it.is_featured ?? false,
    canQuickAdd: false,
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
  const gridItems = items.slice(0, 8).map((it) => mapItem(it, currency, locale, labels.freeDelivery ?? "Free delivery"));

  return (
    <div className="space-y-[var(--ps-space-4)]">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {gridItems.map((item) => (
          <CatalogCard
            key={item.id}
            item={item}
            onSelect={(id) => setSelectedId(id)}
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
