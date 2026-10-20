"use client";

/**
 * components/site/blocks/StorefrontBrowse.tsx
 *
 * One shared client enhancement for menu + shop browse: category chips,
 * accent-insensitive search, item cards as buttons, accessible item
 * detail sheet (bottom sheet on mobile, centered modal on desktop), and
 * guest cart + order request flow (Phase 2b-2).
 *
 * Progressive enhancement contract: the server always renders the full static
 * section HTML as `children`. Before mount (and with JS disabled) only that
 * static markup shows. After mount this component renders chips + search and
 * takes over the grids.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  BROWSE_ALL_GROUP,
  defaultBrowseOptionSelections,
  availableBrowseOptionGroups,
  describeBrowseOptionGroupRules,
  hasAvailableBrowseOptionGroups,
  filterBrowseGroups,
  sortBrowseItems,
  type BrowseGroup,
  type BrowseItem,
  type BrowseOption,
  type BrowseOptionGroup,
  type BrowseSortKey,
} from "@/lib/storefront-browse";
import {
  ProductCarousel,
  type ProductCarouselItem,
} from "./ProductCarousel";
import { CatalogCarousel } from "./CatalogCard";
import type { Locale } from "@/i18n/routing";
import {
  StoreCartWidget,
  type StoreCartCatalogEntry,
  type StoreCartLabels,
} from "@/components/site/v2/StoreCartDrawer";
import { addStoreCartItem } from "@/lib/store-cart";
import { submitOrderRequest, validatePromoCode, type ValidatePromoCodeResult } from "@/lib/actions/orders";
import { formatMoney } from "@/lib/money";
import {
  calculateMenuLineTotal,
  calculatePromotionCartPricing,
  calculateSelectedMenuUnitPrice,
  isOptionGroupSelectionSatisfied,
  MAX_LINE_QUANTITY,
  type MenuPricingItem,
  type OptionGroupSelection,
} from "@/lib/menu-pricing";
import type { MenuPromotion } from "@/lib/menu-promotions";
import {
  createStorefrontCartLineId,
  createStorefrontPriceVersion,
  migrateStorefrontCart,
  reconcileStorefrontCart,
  STOREFRONT_CART_VERSION,
  upsertStorefrontCartLine,
  type StorefrontCartLine,
} from "@/lib/storefront-cart";
import StripeProvider from "@/components/payments/StripeProvider";
import PaymentForm from "@/components/payments/PaymentForm";

export interface StorefrontOrderConfig {
  enabled: boolean;
  slug: string;
  currency: string;
  offerings?: string[];
  /** Online card payment available (USD site + owner ticked + built). */
  onlinePayment?: boolean;
  isClosed?: boolean;
  closedNotice?: string;
  scheduledFor?: string | null;
  blocked?: boolean;
  blockReason?: string;
  /** Flat delivery fee in the site currency (0 = free). Computed server-side; displayed in cart. */
  deliveryFee?: number;
  /** Subtotal threshold above which delivery is free (null = no free threshold). */
  freeDeliveryAbove?: number | null;
}

export interface StorefrontBrowseLabels {
  categories: string;
  all: string;
  searchLabel: string;
  searchPlaceholder: string;
  clearFilters: string;
  noResults: string;
  details: string;
  close: string;
  allergens: string;
  soldOut?: string;
  required?: string;
  optional?: string;
  options?: string;
  addToOrder?: string;
  updateOrder?: string;
  quantityLimit?: string;
  viewOrder?: string;
  yourOrder?: string;
  emptyCart?: string;
  subtotal?: string;
  deliveryFee?: string;
  deliveryFeeNotice?: string;
  freeDelivery?: string;
  freeDeliveryProgress?: string;
  total?: string;
  fulfilment?: string;
  pickup?: string;
  delivery?: string;
  deliveryAddress?: string;
  deliveryAddressPlaceholder?: string;
  customerDetails?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  orderNote?: string;
  orderNotePlaceholder?: string;
  orderNoteHint?: string;
  paymentOnFulfilment?: string;
  paymentMethod?: string;
  payOnline?: string;
  payingOnline?: string;
  onlinePaymentNotice?: string;
  placeOrder?: string;
  placingOrder?: string;
  orderSuccessTitle?: string;
  orderSuccessSubtext?: string;
  orderNumber?: string;
  scheduledNotice?: string;
  noUpcomingHours?: string;
  backToMenu?: string;
  asap?: string;
  scheduleForLater?: string;
  chooseDate?: string;
  chooseTime?: string;
  trackOrder?: string;
  copyTrackingLink?: string;
  trackingLinkCopied?: string;
  loadMore?: string;
}

export type CartItem = StorefrontCartLine;

interface StorefrontBrowseProps {
  groups: BrowseGroup[];
  labels: StorefrontBrowseLabels;
  /** No chips row when there is a single category (search still shows). */
  showGroups: boolean;
  emptyHint?: string;
  itemMode?: "details" | "links";
  categoryTiles?: boolean;
  pageSize?: number;
  /** Template-scoped menu presentation. Absent keeps existing cards. */
  variant?: "cards" | "rows" | "editorial" | "catalog-carousel";
  /** Site price display default (ISO 4217). */
  currency?: string;
  /** Locale for price formatting. */
  currencyLocale?: Locale;
  orderConfig?: StorefrontOrderConfig;
  accentColor?: string;
  /**
   * Opt-in home-row mode: render paged items as a snap-scroll carousel
   * instead of grouped grids. Search, chips, and load-more behavior above
   * it are unchanged. Absent everywhere else, so existing sites are
   * untouched.
   */
  carousel?: {
    prevLabel: string;
    nextLabel: string;
    regionLabel: string;
    imageFit?: "cover" | "contain";
  };
  /**
   * Opt-in Shop sorting (Store template only): featured / newest /
   * price low-high / price high-low. Absent everywhere else, so existing
   * sites keep their current order.
   */
  sort?: {
    label: string;
    featured: string;
    newest: string;
    priceAsc: string;
    priceDesc: string;
  };
  /**
   * Opt-in Store cart (Store template only): quick-add buttons on carousel
   * cards plus a floating cart button + drawer. Absent everywhere else.
   */
  storeCart?: {
    slug: string;
    siteCurrency: string;
    addLabel: string;
    labels: StoreCartLabels;
  };
  children: React.ReactNode;
}

export function TableFlameMenuRows({
  items,
  onSelect,
  onQuickAdd,
  soldOutLabel,
}: {
  items: BrowseItem[];
  onSelect: (item: BrowseItem, trigger: HTMLButtonElement) => void;
  onQuickAdd?: (item: BrowseItem, trigger: HTMLButtonElement) => void;
  soldOutLabel?: string;
}) {
  return <>
    {items.map((item) => (
      <div key={item.id} className="flex min-h-11 items-center gap-2">
        <button
          data-menu-row="true"
          type="button"
          aria-label={`${item.name}${item.priceLabel ? `, ${item.priceLabel}` : ""}`}
          onClick={(event) => onSelect(item, event.currentTarget)}
          className="group flex min-h-11 min-w-0 flex-1 items-center gap-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="shrink-0 text-base font-semibold text-[var(--ps-text)] group-hover:text-[var(--ps-accent-hover)]">{item.name}</span>
              <span aria-hidden="true" className="min-w-3 flex-1 border-b border-dotted border-[var(--tf-menu-leader)]" />
              <span className="shrink-0 text-base font-semibold tabular-nums text-[var(--ps-text)]">{item.priceLabel}</span>
            </span>
            {item.description ? <span className="mt-1 block text-sm leading-6 text-[var(--ps-muted)]">{item.description}</span> : null}
            {item.originalPriceLabel || item.discountLabel ? <span className="mt-1 flex flex-wrap items-center gap-2">{item.originalPriceLabel ? <span className="text-xs font-normal text-[var(--ps-muted)] line-through">{item.originalPriceLabel}</span> : null}{item.discountLabel ? <span className="rounded-full bg-[var(--ps-accent)] px-2 py-1 text-[10px] font-bold leading-none text-[var(--ps-accent-foreground)]">{item.discountLabel}</span> : null}</span> : null}
            {item.isSoldOut && soldOutLabel ? <span className="mt-1 inline-block text-xs font-semibold text-[var(--ps-muted)]">{soldOutLabel}</span> : null}
          </span>
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" width={88} height={88} className="h-[88px] w-[88px] shrink-0 rounded-xl border border-[var(--tf-border)] object-cover" loading="lazy" />
          ) : null}
        </button>
        {onQuickAdd && !item.isSoldOut ? (
          <button type="button" aria-label={`Add ${item.name} to order`} onClick={(event) => onQuickAdd(item, event.currentTarget)} className="min-h-11 min-w-11 rounded-full border border-[var(--tf-border)] text-lg font-semibold text-[var(--ps-text)] hover:bg-[var(--tf-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]">+</button>
        ) : null}
      </div>
    ))}
  </>;
}

function loadCart(slug: string): { lines: CartItem[]; needsSave: boolean } {
  if (typeof window === "undefined" || !slug) return { lines: [], needsSave: false };
  try {
    const raw = localStorage.getItem(`aldriva_cart_${slug}`);
    if (!raw) return { lines: [], needsSave: false };
    return migrateStorefrontCart(JSON.parse(raw), createStorefrontCartLineId);
  } catch {
    return { lines: [], needsSave: false };
  }
}

function saveCart(slug: string, cart: CartItem[]): void {
  if (typeof window === "undefined" || !slug) return;
  try {
    localStorage.setItem(`aldriva_cart_${slug}`, JSON.stringify({ version: STOREFRONT_CART_VERSION, items: cart }));
  } catch {
    // quota exceeded or private mode, silently ignore
  }
}

function optionQuantityKey(groupId: string, optionId: string): string {
  return `${groupId}:${optionId}`;
}

function browseLineUnitPrice(
  item: BrowseItem,
  selectedOptionIds: readonly string[],
  selectedOptions?: readonly { groupId?: string; optionId: string; qty: number }[],
  currency = "USD",
  subtotal = 0
): number {
  return calculateSelectedMenuUnitPrice(browsePricingItem(item), browseOptionSelection(item, selectedOptionIds, selectedOptions), {
    currency,
    subtotal,
    organizerId: item.organizerId,
    promotions: item.promotions ?? [],
  }).unitPrice;
}

function browsePricingItem(item: BrowseItem): MenuPricingItem {
  const groups = item.optionGroups || [];
  return {
    id: item.id,
    organizer_id: item.organizerId,
    section_id: item.sectionId,
    created_at: item.createdAt,
    price: typeof item.rawPrice === "number" ? item.rawPrice : typeof item.numericPrice === "number" ? item.numericPrice : 0,
    promo_price: item.promoPrice ?? null,
    is_active: item.isActive !== false,
    is_sold_out: Boolean(item.isSoldOut),
    promotions: item.promotions ?? [],
    option_groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      min: group.min,
      max: group.max,
      kind: group.kind || "addon" as const,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        price_delta: group.kind === "variant" ? 0 : Number(option.priceDelta) || 0,
        price: Number(option.price ?? option.priceDelta) || 0,
        max_qty: option.maxQty ?? 1,
        is_available: option.isAvailable !== false,
      })),
    })),
  };
}

function browseOptionSelection(
  item: BrowseItem,
  selectedOptionIds: readonly string[],
  selectedOptions?: readonly { groupId?: string; optionId: string; qty: number }[]
): OptionGroupSelection[] {
  return (item.optionGroups || []).map((group) => {
    const selected = selectedOptions?.filter((entry) =>
      entry.groupId ? entry.groupId === group.id : group.options.some((option) => option.id === entry.optionId)
    ) || selectedOptionIds.filter((optionId) => group.options.some((option) => option.id === optionId)).map((optionId) => ({ optionId, qty: 1 }));
    return { groupId: group.id, optionIds: selected.map((entry) => entry.optionId), selectedOptions: selected };
  }).filter((group) => group.optionIds.length > 0);
}

function browseCartPricing(cart: CartItem[], allItems: BrowseItem[], currency: string) {
  const itemsById = new Map(allItems.map((item) => [item.id, item]));
  const lines = cart.flatMap((line) => {
    const item = itemsById.get(line.itemId);
    return item ? [{ item: browsePricingItem(item), selection: browseOptionSelection(item, line.selectedOptionIds, line.selectedOptions), quantity: line.quantity }] : [];
  });
  const promotionsById = new Map<string, MenuPromotion>();
  for (const item of allItems) for (const promotion of item.promotions ?? []) promotionsById.set(promotion.id, promotion);
  return calculatePromotionCartPricing(lines, [...promotionsById.values()], {
    currency,
    organizerId: allItems.find((item) => item.organizerId)?.organizerId,
    now: new Date(),
  });
}

export function StorefrontBrowse({
  groups,
  labels,
  showGroups,
  orderConfig,
  accentColor,
  carousel,
  sort,
  storeCart,
  children,
  itemMode = "details",
  categoryTiles = false,
  pageSize,
  variant = "cards",
  currency,
  currencyLocale,
}: StorefrontBrowseProps) {
  const isTableFlame = variant === "rows";
  const isEditorial = variant === "editorial";
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(() => groups[0]?.id ?? BROWSE_ALL_GROUP);
  const activeGroupRef = useRef(groups[0]?.id ?? BROWSE_ALL_GROUP);
  const [sortKey, setSortKey] = useState<BrowseSortKey>("featured");
  const [visibleItemCount, setVisibleItemCount] = useState(Math.max(1, pageSize ?? 12));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [renderedGroupIds, setRenderedGroupIds] = useState<Set<string>>(() => new Set(groups.slice(0, 1).map((group) => group.id)));
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string;
    trackingToken?: string | null;
    scheduledFor?: string | null;
    subtotal?: number | null;
    deliveryFee?: number | null;
    total?: number | null;
    fulfilmentType?: string | null;
    currency?: string | null;
  } | null>(null);
  const [activeOrder, setActiveOrder] = useState<{
    token: string;
    orderNumber: string;
    scheduledFor?: string | null;
    savedAt?: number;
  } | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledDeepLinkRef = useRef("");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const searchId = useId();
  const chipsId = useId();

  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const visible = useMemo(() => filterBrowseGroups(groups, query, BROWSE_ALL_GROUP), [groups, query]);

  const announce = useCallback((message: string) => {
    setFeedbackMessage(message);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimeoutRef.current = null;
    }, 2500);
  }, []);

  useEffect(() => {
    setMounted(true);
    if (orderConfig?.enabled && orderConfig.slug) {
      const loaded = loadCart(orderConfig.slug);
      const reconciled = reconcileStorefrontCart(loaded.lines, allItems);
      setCart(reconciled.lines);
      if (loaded.needsSave || reconciled.removed > 0) saveCart(orderConfig.slug, reconciled.lines);
      if (reconciled.removed > 0) announce("Your menu changed. Unavailable items or options were removed from your order.");
      try {
        const raw = localStorage.getItem(`aldriva_active_order_${orderConfig.slug}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.token && parsed?.orderNumber && Date.now() - (parsed.savedAt || 0) < 86400000) {
            setActiveOrder(parsed);
          }
        }
      } catch {
        // Storage unavailable (private browsing)
      }
    }
  }, [orderConfig?.enabled, orderConfig?.slug, allItems, announce]);

  useEffect(() => {
    if (!mounted) return;
    if (typeof IntersectionObserver === "undefined") {
      setRenderedGroupIds(new Set(visible.map((group) => group.id)));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const groupId = (entry.target as HTMLElement).dataset.menuGroupId;
        if (groupId) setRenderedGroupIds((current) => new Set(current).add(groupId));
      }
    }, { rootMargin: "500px 0px 500px 0px" });
    for (const group of visible) {
      const section = sectionRefs.current.get(group.id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [mounted, visible]);

  useEffect(() => {
    if (!mounted || typeof IntersectionObserver === "undefined") return;
    const visibleCategoryIds = new Set(visible.map((group) => group.id));
    const observer = new IntersectionObserver((entries) => {
      const selectedSection = sectionRefs.current.get(activeGroupRef.current);
      const selectedRect = selectedSection?.getBoundingClientRect();
      if (selectedRect && selectedRect.bottom > 0 && selectedRect.top < window.innerHeight) return;
      const current = entries.filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      const groupId = (current?.target as HTMLElement | undefined)?.dataset.menuGroupId;
      if (groupId && visibleCategoryIds.has(groupId)) {
        activeGroupRef.current = groupId;
        setActiveGroup(groupId);
        setRenderedGroupIds((rendered) => new Set(rendered).add(groupId));
      }
    }, { rootMargin: "-120px 0px -65% 0px", threshold: 0 });
    for (const group of visible) {
      const section = sectionRefs.current.get(group.id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [mounted, visible]);

  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";

  const updateCart = (nextCart: CartItem[]) => {
    setCart(nextCart);
    if (orderConfig?.slug) {
      saveCart(orderConfig.slug, nextCart);
    }
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const openSheet = (id: string, trigger: HTMLElement | null, line?: CartItem) => {
    triggerRef.current = trigger;
    setEditingLineId(line?.lineId ?? null);
    setSelectedId(id);
  };

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const sectionId = params.get("section");
    const key = `${itemId ?? ""}|${sectionId ?? ""}`;
    if (!itemId && !sectionId || handledDeepLinkRef.current === key) return;
    const item = itemId ? allItems.find((candidate) => candidate.id === itemId) : undefined;
    const section = sectionId ? groups.find((candidate) => candidate.id === sectionId) : undefined;
    if (!item && !section) return;
    handledDeepLinkRef.current = key;
    if (item) {
      setEditingLineId(null);
      setSelectedId(item.id);
      params.delete("item");
      const query = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    if (section) {
      activeGroupRef.current = section.id;
      setActiveGroup(section.id);
      setRenderedGroupIds((current) => new Set(current).add(section.id));
      window.setTimeout(() => {
        tabRefs.current.get(section.id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        sectionRefs.current.get(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, [mounted, allItems, groups]);

  const closeSheet = () => {
    const editedLineId = editingLineId;
    setSelectedId(null);
    setEditingLineId(null);
    if (editedLineId) {
      setIsCartOpen(true);
      setTimeout(() => document.querySelector<HTMLElement>(`[data-cart-edit-id="${editedLineId}"]`)?.focus(), 0);
    } else {
      triggerRef.current?.focus();
    }
    triggerRef.current = null;
  };

  const selected = selectedId
    ? allItems.find((item) => item.id === selectedId) ?? null
    : null;

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Compute cart subtotal from items
  const cartPricing = useMemo(() => browseCartPricing(cart, allItems, orderConfig?.currency || currency || "USD"), [cart, allItems, orderConfig?.currency, currency]);
  const cartSubtotal = cartPricing.subtotal;
  const formattedCartSubtotal = `${orderConfig?.currency || currency || "USD"} ${cartSubtotal.toFixed(2)}`;

  const handleAddToOrder = (
    itemId: string,
    selectedOptionIds: string[],
    quantity: number,
    selectedOptions: Array<{ groupId: string; optionId: string; qty: number }>
  ) => {
    const candidate: CartItem = {
      lineId: editingLineId ?? createStorefrontCartLineId(),
      itemId,
      selectedOptionIds,
      selectedOptions,
      quantity,
    };
    const result = upsertStorefrontCartLine(cart, candidate, editingLineId);
    const pricedCart = browseCartPricing(result.lines, allItems, orderConfig?.currency || currency || "USD");
    let priceIndex = 0;
    const nextCart = result.lines.map((line) => {
      if (!allItems.some((candidateItem) => candidateItem.id === line.itemId)) return line;
      const calculated = pricedCart.lines[priceIndex++];
      return calculated ? { ...line, priceVersion: createStorefrontPriceVersion(calculated.unitPrice + calculated.optionsDelta) } : line;
    });
    updateCart(nextCart);
    closeSheet();
    announce(result.capped ? `Maximum ${MAX_LINE_QUANTITY} per item` : editingLineId ? "Order updated" : "Added to order");
  };

  const handleQuickMenuAdd = (item: BrowseItem, trigger: HTMLButtonElement) => {
    if (item.isSoldOut || hasAvailableBrowseOptionGroups(item.optionGroups)) return;
    triggerRef.current = trigger;
    handleAddToOrder(item.id, [], 1, []);
  };

  // Catalog carousel (Savannah): render per-category scrollable carousels
  // both server-side and after mount, replacing the static cards grid.
  // When a card is clicked, the item sheet renders below the carousel.
  if (variant === "catalog-carousel") {
    return (
      <div className="space-y-[var(--ps-space-8)]">
        {/* Aria-live region for screen readers & toast announcement */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {feedbackMessage || ""}
        </div>

        {groups.map((group) => (
          <section
            key={group.id}
            id={`menu-section-${group.id}`}
            data-menu-group-id={group.id}
            ref={(node) => { if (node) sectionRefs.current.set(group.id, node); else sectionRefs.current.delete(group.id); }}
            className="space-y-[var(--ps-space-3)]"
          >
            <h3 id={`group-title-${group.id}`} className="text-base font-bold text-[var(--ps-text)]">
              {group.title}
            </h3>
            {!mounted || renderedGroupIds.has(group.id) ? <CatalogCarousel
              items={group.items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                image: item.image,
                priceLabel: item.priceLabel,
                numericPrice: item.numericPrice,
                originalPriceLabel: item.originalPriceLabel,
                discountLabel: item.discountLabel,
                promotionEndsAt: item.promotionEndsAt,
                freeDeliveryLabel: item.freeDeliveryLabel,
                isSoldOut: item.isSoldOut,
                canQuickAdd: Boolean(orderConfig?.enabled && !orderConfig.blocked && !item.isSoldOut && !hasAvailableBrowseOptionGroups(item.optionGroups)),
              }))}
              prevLabel={carousel?.prevLabel ?? labels.all}
              nextLabel={carousel?.nextLabel ?? labels.all}
              currency={currency}
              locale={locale}
              imageFit={carousel?.imageFit}
              onSelect={(id, trigger) => openSheet(id, trigger ?? null)}
              onQuickAdd={(id, trigger) => {
                const item = allItems.find((candidate) => candidate.id === id);
                if (item) handleQuickMenuAdd(item, trigger);
              }}
            /> : <div aria-hidden="true" style={{ minHeight: `${Math.max(1, Math.min(group.items.length, 4)) * 14}rem` }} />}
          </section>
        ))}
        {selected ? (
          <ItemDetailSheet
            key={`${selected.id}-${editingLineId ?? "new"}`}
            itemId={selected.id}
            title={selected.name}
            image={selected.image ?? null}
            description={selected.description ?? null}
            priceLabel={selected.priceLabel}
            originalPriceLabel={selected.originalPriceLabel}
            numericPrice={selected.numericPrice}
            pricingItem={selected}
            pricingSubtotal={cartPricing.preDiscountSubtotal}
            isSoldOut={selected.isSoldOut}
            optionGroups={selected.optionGroups}
            tags={selected.tags}
            detailRows={selected.detailRows}
            action={selected.action}
            tableFlame={false}
            savannah={true}
            closeLabel={labels.close}
            labels={labels}
            orderConfig={orderConfig}
            locale={locale}
            initialCartLine={cart.find((line) => line.lineId === editingLineId)}
            isEditing={Boolean(editingLineId)}
            onAddToOrder={handleAddToOrder}
            onClose={closeSheet}
          />
        ) : null}

        {/* Floating cart bar */}
        {orderConfig?.enabled && totalCartCount > 0 && !isCartOpen && !orderSuccess ? (
          <div className="fixed bottom-4 inset-x-4 z-40 max-w-lg mx-auto">
            <div className="flex items-center justify-between gap-[var(--ps-space-3)] bg-[var(--tf-band)] p-[var(--ps-space-4)] text-[var(--tf-on-band)] shadow-none rounded-none">
              <div className="flex items-center gap-[var(--ps-space-3)]">
                <span className="flex h-7 w-7 items-center justify-center rounded-none bg-[var(--ps-accent)] text-xs font-bold text-[var(--tf-on-accent)]">
                  {totalCartCount}
                </span>
                <div className="text-sm font-semibold">
                  {labels.yourOrder || "Your order"} • {formattedCartSubtotal}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="ps-button ps-button-primary savannah-button rounded-none shadow-none text-xs font-bold transition"
              >
                {labels.viewOrder || "View order"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Order Drawer */}
        {isCartOpen && orderConfig ? (
          <OrderDrawer
            cart={cart}
            orderConfig={orderConfig}
            allItems={allItems}
            labels={labels}
            accentColor={accentColor}
            savannah={true}
            onClose={() => setIsCartOpen(false)}
            onUpdateQuantity={(index, qty) => {
              if (qty <= 0) {
                updateCart(cart.filter((_, i) => i !== index));
              } else {
                updateCart(cart.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
              }
            }}
            onRemoveItem={(index) => {
              updateCart(cart.filter((_, i) => i !== index));
            }}
            onEditItem={(line, trigger) => {
              setIsCartOpen(false);
              openSheet(line.itemId, trigger, line);
            }}
            onOrderSuccess={(result) => {
              updateCart([]);
              setIsCartOpen(false);
              setOrderSuccess(result);
            }}
          />
        ) : null}

        {/* Confirmation Modal */}
        {orderSuccess && orderConfig?.slug ? (
          <OrderConfirmationModal
            orderNumber={orderSuccess.orderNumber}
            trackingToken={orderSuccess.trackingToken}
            slug={orderConfig.slug}
            scheduledFor={orderSuccess.scheduledFor}
            subtotal={orderSuccess.subtotal}
            deliveryFee={orderSuccess.deliveryFee}
            total={orderSuccess.total}
            fulfilmentType={orderSuccess.fulfilmentType}
            currency={orderSuccess.currency ?? orderConfig.currency}
            labels={labels}
            tableFlame={false}
            savannah={true}
            onClose={() => setOrderSuccess(null)}
          />
        ) : null}

        {/* Bottom padding to prevent floating cart bar from covering last content */}
        {orderConfig?.enabled && totalCartCount > 0 && !isCartOpen && !orderSuccess ? (
          <div className="h-24" aria-hidden="true" />
        ) : null}
      </div>
    );
  }

  // Before hydration (and without JS): server static markup only.
  if (!mounted) return <>{children}</>;

  if (groups.length === 0) return <>{children}</>;

  const sortedVisible = sort
    ? visible.map((group) => ({ ...group, items: sortBrowseItems(group.items, sortKey) }))
    : visible;
  const engaged = query.trim() !== "";
  const visibleCount = itemMode === "links" ? visibleItemCount : Number.POSITIVE_INFINITY;
  let remaining = visibleCount;
  const pagedVisible = sortedVisible.flatMap((group) => {
    const items = group.items.slice(0, remaining);
    remaining -= items.length;
    return items.length ? [{ ...group, items }] : [];
  });
  const categoryGroups = categoryTiles ? pagedVisible.filter((group) => group.id !== "uncategorized") : pagedVisible;
  const selectedTabGroup = categoryGroups.some((group) => group.id === activeGroup) ? activeGroup : categoryGroups[0]?.id;
  const totalVisibleItems = sortedVisible.reduce((count, group) => count + group.items.length, 0);

  const handleSortChange = (next: BrowseSortKey) => {
    setSortKey(next);
    setVisibleItemCount(Math.max(1, pageSize ?? 12));
  };

  const carouselItems: ProductCarouselItem[] = pagedVisible.flatMap((group) =>
    group.items.map((item) => {
      const badge =
        item.badge ?? (item.isSoldOut && labels.soldOut ? labels.soldOut : null);
      return {
        id: `${group.id}-${item.id}`,
        href: item.action && item.action.href !== "#" ? item.action.href : null,
        image: item.image ?? null,
        name: item.name,
        description: item.description ?? null,
        priceLabel: item.priceLabel,
        badge,
        badgeTone: badge
          ? (item.badgeTone ?? (item.isSoldOut ? "alert" : "muted"))
          : undefined,
        canAdd: !item.isSoldOut,
      };
    })
  );

  const handleQuickAdd = (compositeId: string) => {
    if (!storeCart) return;
    // Carousel ids are `${group.id}-${item.id}`; recover the item by match
    // against the visible catalog instead of parsing ids.
    const found = pagedVisible
      .flatMap((group) => group.items.map((item) => ({ group, item })))
      .find(({ group, item }) => `${group.id}-${item.id}` === compositeId);
    if (!found || found.item.isSoldOut) return;
    addStoreCartItem(storeCart.slug, found.item.id, 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("store-cart:added"));
    }
  };

  // Full filtered catalog (not paged) so drawer rows resolve even past
  // Load More; availability still comes from live stock flags.
  const cartCatalog: StoreCartCatalogEntry[] = sortedVisible.flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      name: item.name,
      image: item.image ?? null,
      priceLabel: item.priceLabel,
      numericPrice: item.numericPrice,
      isSoldOut: Boolean(item.isSoldOut),
      href: item.action && item.action.href !== "#" ? item.action.href : null,
    }))
  );
  const reset = () => {
    setQuery("");
    const firstGroupId = groups[0]?.id ?? BROWSE_ALL_GROUP;
    activeGroupRef.current = firstGroupId;
    setActiveGroup(firstGroupId);
    setSortKey("featured");
    setVisibleItemCount(Math.max(1, pageSize ?? 12));
  };

  const scrollToGroup = (groupId: string) => {
    activeGroupRef.current = groupId;
    setActiveGroup(groupId);
    setRenderedGroupIds((current) => new Set(current).add(groupId));
    const section = sectionRefs.current.get(groupId);
    if (section) section.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const moveCategoryTab = (event: React.KeyboardEvent<HTMLButtonElement>, groupId: string) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = categoryGroups.findIndex((group) => group.id === groupId);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = categoryGroups[(index + direction + categoryGroups.length) % categoryGroups.length];
    if (!next) return;
    tabRefs.current.get(next.id)?.focus();
    scrollToGroup(next.id);
  };

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{feedbackMessage || ""}</div>
      {/* Active order persistent banner */}
      {activeOrder && !orderSuccess && orderConfig?.slug ? (
        <div className="mb-[var(--ps-space-4)] flex items-center justify-between gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-accent-light)] bg-[var(--ps-accent-light)]/90 px-[var(--ps-space-4)] py-[var(--ps-space-3)] text-xs text-[var(--ps-accent-hover)] shadow-xs">
          <div className="flex items-center gap-[var(--ps-space-2)] min-w-0">
            <span className="h-2 w-2 rounded-full bg-[var(--ps-accent)] shrink-0 animate-pulse" />
            <span className="truncate">
              Active order <strong className="font-bold">{activeOrder.orderNumber}</strong>
            </span>
          </div>
          <div className="flex items-center gap-[var(--ps-space-3)] shrink-0">
            <a
              href={`/site/${orderConfig.slug}/orders/${activeOrder.token}`}
              className="font-bold text-[var(--ps-accent-hover)] underline hover:text-[var(--ps-accent-hover)] transition-colors"
            >
              {labels.trackOrder || "Track order"} →
            </a>
            <button
              type="button"
              onClick={() => {
                setActiveOrder(null);
                try {
                  localStorage.removeItem(`aldriva_active_order_${orderConfig.slug}`);
                } catch {
                  // ignore
                }
              }}
              className="text-[var(--ps-muted)] hover:text-[var(--ps-muted)] text-xs px-[var(--ps-space-1)]"
              aria-label="Dismiss active order banner"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {showGroups && categoryGroups.length > 1 ? (
        <div
          className={`sticky top-[var(--site-header-h)] z-30 -mx-[var(--ps-space-1)] py-[var(--ps-space-2)] backdrop-blur ${variant === "rows" ? "bg-[var(--ps-cream)]" : isEditorial ? "bg-[var(--tf-base)]" : "bg-[var(--ps-surface)]/95"}`}
          role="tablist"
          aria-label={labels.categories}
          id={chipsId}
        >
          <div className="flex gap-[var(--ps-space-2)] overflow-x-auto px-[var(--ps-space-1)] pb-[var(--ps-space-1)]">
            {categoryGroups.map((group) => {
              const groupId = group.id;
              const active = selectedTabGroup === groupId;
              const title = group.title;
              return (
                <button
                  key={groupId}
                  type="button"
                  ref={(node) => { if (node) tabRefs.current.set(groupId, node); else tabRefs.current.delete(groupId); }}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`menu-section-${groupId}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => scrollToGroup(groupId)}
                  onKeyDown={(event) => moveCategoryTab(event, groupId)}
                  className={isEditorial
                    ? `shrink-0 whitespace-nowrap rounded-none border-0 border-b-2 px-[var(--ps-space-4)] py-[var(--ps-space-2)] text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] ${active ? "border-[var(--ps-accent)] text-[var(--ps-accent-hover)]" : "border-transparent text-[var(--ps-muted)] hover:text-[var(--ps-text)]"}`
                    : `shrink-0 whitespace-nowrap rounded-full border px-[var(--ps-space-4)] py-[var(--ps-space-2)] text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] ${
                    active
                      ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent)] text-[var(--ps-accent-foreground)] shadow-xs"
                      : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:border-[var(--ps-border)] hover:bg-[var(--ps-neutral)]"
                  }`}
                >
                  {title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="my-[var(--ps-space-4)]">
        <label htmlFor={searchId} className="sr-only">
          {labels.searchLabel}
        </label>
        <div className="relative">
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-4)] py-[var(--ps-space-2)] text-sm text-[var(--ps-text)] shadow-xs placeholder:text-[var(--ps-muted)] focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-2 ring-[var(--ps-accent-hover)]/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={labels.clearFilters}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-[var(--ps-space-1)] text-[var(--ps-muted)] hover:text-[var(--ps-muted)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {sort && totalVisibleItems > 0 ? (
        <div className="mb-[var(--ps-space-4)] flex items-center justify-end gap-[var(--ps-space-2)]">
          <label htmlFor={`${searchId}-sort`} className="text-xs font-semibold text-[var(--ps-muted)]">
            {sort.label}
          </label>
          <select
            id={`${searchId}-sort`}
            value={sortKey}
            onChange={(event) => handleSortChange(event.target.value as BrowseSortKey)}
            className="rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs font-semibold text-[var(--ps-text)] shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
          >
            <option value="featured">{sort.featured}</option>
            <option value="newest">{sort.newest}</option>
            <option value="priceAsc">{sort.priceAsc}</option>
            <option value="priceDesc">{sort.priceDesc}</option>
          </select>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ps-border)] py-[var(--ps-space-12)] text-center text-sm text-[var(--ps-muted)]">
          <p>{labels.noResults}</p>
          {engaged ? (
            <button
              type="button"
              onClick={reset}
              className="mt-[var(--ps-space-3)] text-xs font-semibold text-[var(--ps-accent-hover)] hover:text-[var(--ps-accent-hover)] underline"
            >
              {labels.clearFilters}
            </button>
          ) : null}
        </div>
      ) : carousel ? (
        <ProductCarousel
          items={carouselItems}
          labels={{ prev: carousel.prevLabel, next: carousel.nextLabel, region: carousel.regionLabel }}
          {...(storeCart ? { onAdd: handleQuickAdd, addLabel: storeCart.addLabel } : {})}
        />
      ) : (
        <div className="space-y-[var(--ps-space-8)]">
          {pagedVisible.map((group) => (
            <section
              key={group.id}
              id={`menu-section-${group.id}`}
              data-menu-group-id={group.id}
              ref={(node) => { if (node) sectionRefs.current.set(group.id, node); else sectionRefs.current.delete(group.id); }}
              style={{ scrollMarginTop: "calc(var(--site-header-h, 0px) + 4rem)" }}
              {...(categoryTiles && group.id === "uncategorized" ? {} : { "aria-labelledby": `group-title-${group.id}` })}
              className="space-y-[var(--ps-space-3)]"
            >
              {categoryTiles && group.id === "uncategorized" ? null : (
                <h3 id={`group-title-${group.id}`} className="text-base font-bold text-[var(--ps-text)]">
                  {group.title}
                </h3>
              )}
              {renderedGroupIds.has(group.id) || group.id === selectedTabGroup ? <div className={variant === "rows" ? "divide-y divide-[var(--tf-border)] border-y border-[var(--tf-border)]" : isEditorial ? "grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10" : "grid gap-[var(--ps-space-3)] sm:grid-cols-2 lg:grid-cols-3"}>
                {group.items.map((item) => itemMode === "links" ? (
                  item.action ? (
                    <Link
                      key={item.id}
                      href={item.action.href}
                      aria-label={`${item.name} — ${item.action.label}`}
                      className="group flex min-h-11 items-start gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-3)] text-left shadow-xs transition hover:border-[var(--ps-border)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
                    >
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--ps-text)] group-hover:text-[var(--ps-accent-hover)]">{item.name}</span>
                        {item.description ? <span className="mt-[var(--ps-space-1)] line-clamp-2 block text-xs text-[var(--ps-muted)]">{item.description}</span> : null}
                        {item.priceLabel ? <span className="mt-[var(--ps-space-1)] block text-xs font-bold text-[var(--ps-text)]">{item.priceLabel}</span> : null}
                        {item.detailRows[0] ? <span className="mt-[var(--ps-space-1)] block text-xs text-[var(--ps-muted)]">{item.detailRows[0].value}</span> : null}
                      </span>
                    </Link>
                  ) : (
                    <article key={item.id} className="flex min-h-11 items-start gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-3)]">
                      <span className="text-sm font-semibold text-[var(--ps-text)]">{item.name}</span>
                    </article>
                  )
                ) : isEditorial ? (
                  <div key={item.id} className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`${item.name}${item.priceLabel ? `, ${item.priceLabel}` : ""}`}
                    onClick={(event) => openSheet(item.id, event.currentTarget)}
                    className={`savannah-button group flex min-h-12 min-w-0 flex-1 items-start gap-5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ps-accent-hover)] ${item.isSoldOut ? "opacity-60" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-[var(--v2-heading-font)] text-lg font-bold text-[var(--ps-text)] group-hover:text-[var(--ps-accent-hover)]">{item.name}</span>
                        <span className="flex flex-wrap items-baseline gap-2">
                          {item.priceLabel ? <span className="shrink-0 text-base font-semibold tabular-nums text-[var(--ps-text)]">{item.priceLabel}</span> : null}
                          {item.originalPriceLabel ? <span className="shrink-0 text-xs font-normal text-[var(--ps-muted)] line-through">{item.originalPriceLabel}</span> : null}
                          {item.discountLabel ? <span className="rounded-full bg-[var(--ps-accent)] px-2 py-1 text-[10px] font-bold leading-none text-[var(--ps-accent-foreground)]">{item.discountLabel}</span> : null}
                        </span>
                      </span>
                      {item.description ? <span className="mt-1 block text-sm leading-6 text-[var(--ps-muted)]">{item.description}</span> : null}
                      {item.isSoldOut && labels.soldOut ? <span className="mt-1 inline-block text-xs font-semibold text-[var(--ps-muted)]">{labels.soldOut}</span> : null}
                    </span>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" width={88} height={88} className="h-[88px] w-[88px] shrink-0 object-cover" loading="lazy" />
                    ) : null}
                  </button>
                  {orderConfig?.enabled && !orderConfig.blocked && !item.isSoldOut && !hasAvailableBrowseOptionGroups(item.optionGroups) ? (
                    <button type="button" aria-label={`Add ${item.name} to order`} onClick={(event) => handleQuickMenuAdd(item, event.currentTarget)} className="min-h-11 min-w-11 self-center rounded-full border border-[var(--tf-border)] bg-[var(--tf-base)] text-lg font-semibold text-[var(--tf-on-base)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]">+</button>
                  ) : null}
                  </div>
                ) : variant === "rows" ? (
                  <TableFlameMenuRows
                    items={[item]}
                    soldOutLabel={labels.soldOut}
                    onSelect={(selectedItem, trigger) => openSheet(selectedItem.id, trigger)}
                    {...(orderConfig?.enabled && !orderConfig.blocked && !item.isSoldOut && !hasAvailableBrowseOptionGroups(item.optionGroups)
                      ? { onQuickAdd: (selectedItem: BrowseItem, trigger: HTMLButtonElement) => handleQuickMenuAdd(selectedItem, trigger) }
                      : {})}
                  />
                ) : (
                  <div key={item.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    aria-label={`${item.name}`}
                    onClick={(event) => openSheet(item.id, event.currentTarget)}
                    className={`group flex min-h-11 min-w-0 flex-1 items-start gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-3)] text-left shadow-xs transition hover:border-[var(--ps-border)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] motion-reduce:transition-none ${
                      item.isSoldOut ? "opacity-60" : ""
                    }`}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-[var(--ps-space-2)]">
                        <span className="block truncate text-sm font-semibold text-[var(--ps-text)] group-hover:text-[var(--ps-accent-hover)]">{item.name}</span>
                        {item.isSoldOut && labels.soldOut ? (
                          <span className="shrink-0 rounded bg-[var(--ps-neutral)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--ps-muted)] border border-[var(--ps-border)]">
                            {labels.soldOut}
                          </span>
                        ) : null}
                      </span>
                      {item.description ? (
                        <span className="mt-[var(--ps-space-1)] line-clamp-2 block text-xs text-[var(--ps-muted)]">{item.description}</span>
                      ) : null}
                      <span className="mt-[var(--ps-space-1)] flex flex-wrap items-baseline gap-[var(--ps-space-2)]">
                        {item.priceLabel ? (
                          <span className={item.originalPriceLabel ? "text-xs font-bold text-[var(--ps-accent-hover)]" : "text-xs font-bold text-[var(--ps-text)]"}>{item.priceLabel}</span>
                        ) : null}
                        {item.originalPriceLabel ? <span className="text-xs font-normal text-[var(--ps-muted)] line-through">{item.originalPriceLabel}</span> : null}
                        {item.discountLabel ? <span className="rounded-full bg-[var(--ps-accent)] px-2 py-1 text-[10px] font-bold leading-none text-[var(--ps-accent-foreground)]">{item.discountLabel}</span> : null}
                      </span>
                    </span>
                  </button>
                  {orderConfig?.enabled && !orderConfig.blocked && !item.isSoldOut && !hasAvailableBrowseOptionGroups(item.optionGroups) ? (
                    <button type="button" aria-label={`Add ${item.name} to order`} onClick={(event) => handleQuickMenuAdd(item, event.currentTarget)} className="min-h-11 min-w-11 self-center rounded-full border border-[var(--ps-border)] bg-[var(--ps-surface)] text-lg font-semibold text-[var(--ps-text)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]">+</button>
                  ) : null}
                  </div>
                ))}
              </div> : <div aria-hidden="true" style={{ minHeight: `${Math.max(1, Math.min(group.items.length, 4)) * 8}rem` }} />}
            </section>
          ))}
        </div>
      )}

      {itemMode === "links" && totalVisibleItems > visibleCount ? (
        <div className="mt-[var(--ps-space-6)] text-center">
          <button
            type="button"
            onClick={() => setVisibleItemCount((count) => count + Math.max(1, pageSize ?? 12))}
            className="ps-button ps-button-secondary min-h-11"
          >
            {labels.loadMore || "Load more"}
          </button>
        </div>
      ) : null}

      {selected ? (
        <ItemDetailSheet
          key={`${selected.id}-${editingLineId ?? "new"}`}
          itemId={selected.id}
          title={selected.name}
          image={selected.image ?? null}
          description={selected.description ?? null}
          priceLabel={selected.priceLabel}
          originalPriceLabel={selected.originalPriceLabel}
          numericPrice={selected.numericPrice}
          pricingItem={selected}
          pricingSubtotal={cartPricing.preDiscountSubtotal}
          isSoldOut={selected.isSoldOut}
          optionGroups={selected.optionGroups}
          tags={selected.tags}
          detailRows={selected.detailRows}
          action={selected.action}
          tableFlame={isTableFlame}
          savannah={isEditorial}
          closeLabel={labels.close}
          labels={labels}
          orderConfig={orderConfig}
          locale={locale}
          initialCartLine={cart.find((line) => line.lineId === editingLineId)}
          isEditing={Boolean(editingLineId)}
          onAddToOrder={handleAddToOrder}
          onClose={closeSheet}
        />
      ) : null}

      {/* Floating cart bar */}
      {orderConfig?.enabled && totalCartCount > 0 && !isCartOpen && !orderSuccess ? (
        <div className="fixed bottom-4 inset-x-4 z-40 max-w-lg mx-auto">
          <div className={isEditorial
            ? "flex items-center justify-between gap-[var(--ps-space-3)] bg-[var(--tf-band)] p-[var(--ps-space-4)] text-[var(--tf-on-band)] shadow-none"
            : `flex items-center justify-between gap-[var(--ps-space-3)] rounded-2xl bg-[var(--ps-text)] p-[var(--ps-space-4)] ${isTableFlame ? "text-[var(--tf-on-ink)]" : "text-white"} shadow-xl`}>
            <div className="flex items-center gap-[var(--ps-space-3)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ps-accent)] text-xs font-bold">
                {totalCartCount}
              </span>
              <div className="text-sm font-semibold">
                {labels.yourOrder || "Your order"} • {formattedCartSubtotal}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className={`ps-button ps-button-primary${isEditorial ? " savannah-button rounded-none shadow-none" : " rounded-xl"} text-xs font-bold transition`}
            >
              {labels.viewOrder || "View order"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Order Drawer */}
      {isCartOpen && orderConfig ? (
        <OrderDrawer
          cart={cart}
          orderConfig={orderConfig}
          allItems={allItems}
          labels={labels}
          accentColor={accentColor}
          savannah={isEditorial}
          onClose={() => setIsCartOpen(false)}
          onUpdateQuantity={(index, qty) => {
            if (qty <= 0) {
              updateCart(cart.filter((_, i) => i !== index));
            } else {
              updateCart(cart.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
            }
          }}
          onRemoveItem={(index) => {
            updateCart(cart.filter((_, i) => i !== index));
          }}
          onEditItem={(line, trigger) => {
            setIsCartOpen(false);
            openSheet(line.itemId, trigger, line);
          }}
          onOrderSuccess={(result) => {
            updateCart([]);
            setIsCartOpen(false);
            setOrderSuccess(result);
          }}
        />
      ) : null}

      {/* Confirmation Modal */}
      {orderSuccess && orderConfig?.slug ? (
        <OrderConfirmationModal
          orderNumber={orderSuccess.orderNumber}
          trackingToken={orderSuccess.trackingToken}
          slug={orderConfig.slug}
          scheduledFor={orderSuccess.scheduledFor}
          subtotal={orderSuccess.subtotal}
          deliveryFee={orderSuccess.deliveryFee}
          total={orderSuccess.total}
          fulfilmentType={orderSuccess.fulfilmentType}
          currency={orderSuccess.currency ?? orderConfig.currency}
          labels={labels}
          tableFlame={isTableFlame}
          savannah={isEditorial}
          onClose={() => setOrderSuccess(null)}
        />
      ) : null}

      {/* Bottom padding to prevent floating cart bar from covering last content */}
      {orderConfig?.enabled && totalCartCount > 0 && !isCartOpen && !orderSuccess ? (
        <div className="h-24" aria-hidden="true" />
      ) : null}

      {/* Store multi-item cart (Store template only) */}
      {storeCart ? (
        <StoreCartWidget
          slug={storeCart.slug}
          siteCurrency={storeCart.siteCurrency}
          catalog={cartCatalog}
          labels={storeCart.labels}
        />
      ) : null}
    </>
  );
}

function ItemDetailSheet({
  itemId,
  title,
  image,
  description,
  priceLabel,
  numericPrice,
  pricingItem,
  pricingSubtotal,
  isSoldOut,
  optionGroups,
  tags,
  detailRows,
  action,
  tableFlame: _tableFlame,
  savannah,
  closeLabel,
  labels,
  orderConfig,
  locale = "en",
  initialCartLine,
  isEditing = false,
  onAddToOrder,
  onClose,
}: {
  itemId: string;
  title: string;
  image: string | null;
  description: string | null;
  priceLabel: string | null;
  originalPriceLabel?: string | null;
  numericPrice?: number;
  pricingItem?: BrowseItem;
  pricingSubtotal?: number;
  isSoldOut?: boolean;
  optionGroups?: BrowseOptionGroup[];
  tags: string[];
  detailRows: Array<{ label: string; value: string }>;
  action?: { label: string; href: string };
  tableFlame: boolean;
  savannah: boolean;
  closeLabel: string;
  labels: StorefrontBrowseLabels;
  orderConfig?: StorefrontOrderConfig;
  locale?: Locale;
  initialCartLine?: CartItem;
  isEditing?: boolean;
  onAddToOrder?: (
    itemId: string,
    selectedOptionIds: string[],
    quantity: number,
    selectedOptions: Array<{ groupId: string; optionId: string; qty: number }>
  ) => void;
  onClose: () => void;
}) {
  void _tableFlame;
  const availableOptionGroups = availableBrowseOptionGroups(optionGroups || []);
  const orderedOptionGroups = availableOptionGroups.map((group, index) => ({ group, index }))
    .sort((left, right) => Number(right.group.required || right.group.kind === "variant") - Number(left.group.required || left.group.kind === "variant") || left.index - right.index)
    .map(({ group }) => group);
  const panelRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef(new Map<string, HTMLDivElement>());
  const titleId = useId();
  const [quantity, setQuantity] = useState(initialCartLine?.quantity ?? 1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(() => {
    if (!initialCartLine) return defaultBrowseOptionSelections(availableOptionGroups);
    const selected: Record<string, string[]> = {};
    for (const entry of initialCartLine.selectedOptions) {
      const group = availableOptionGroups.find((candidate) => candidate.id === entry.groupId && candidate.options.some((option) => option.id === entry.optionId));
      if (group) selected[group.id] = [...(selected[group.id] || []), entry.optionId];
    }
    return selected;
  });
  const [selectedOptionQtys, setSelectedOptionQtys] = useState<Record<string, number>>(() => Object.fromEntries(
    (initialCartLine?.selectedOptions || []).filter((entry) => entry.qty > 1).map((entry) => [optionQuantityKey(entry.groupId, entry.optionId), entry.qty])
  ));
  const [missingGroupId, setMissingGroupId] = useState<string | null>(null);

  // Esc to close + scroll lock; focus the panel on open for screen readers.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => element.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, itemId]);

  // Handle option choice change
  const handleOptionToggle = (group: BrowseOptionGroup, optionId: string) => {
    const groupId = group.id;
    const current = selectedOptions[groupId] || [];
    const isSingle = group.kind === "variant" || group.max === 1;
    const removing = !isSingle && current.includes(optionId);
    setMissingGroupId(null);
    setSelectedOptions((prev) => {
      const current = prev[groupId] || [];
      if (isSingle) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length < group.max) {
        return { ...prev, [groupId]: [...current, optionId] };
      }
      return prev;
    });
    setSelectedOptionQtys((prev) => {
      const next = { ...prev };
      const key = optionQuantityKey(groupId, optionId);
      if (removing) delete next[key];
      else next[key] = 1;
      return next;
    });
  };

  const handleOptionQuantityChange = (group: BrowseOptionGroup, option: BrowseOption, nextQty: number) => {
    const key = optionQuantityKey(group.id, option.id);
    const qty = Math.max(0, Math.min(option.maxQty ?? 1, nextQty));
    setMissingGroupId(null);
    if (qty === 0) {
      setSelectedOptions((prev) => ({
        ...prev,
        [group.id]: (prev[group.id] || []).filter((id) => id !== option.id),
      }));
      setSelectedOptionQtys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setSelectedOptions((prev) => {
      const current = prev[group.id] || [];
      return current.includes(option.id) || current.length >= group.max
        ? prev
        : { ...prev, [group.id]: [...current, option.id] };
    });
    setSelectedOptionQtys((prev) => ({ ...prev, [key]: qty }));
  };

  // Calculate live item line price
  const selectedGroupInputs = availableOptionGroups.map((group) => {
    const selected = selectedOptions[group.id] || [];
    return { groupId: group.id, optionIds: selected, selectedOptions: selected.map((optionId) => ({ optionId, qty: selectedOptionQtys[optionQuantityKey(group.id, optionId)] || 1 })) };
  }).filter((group) => group.optionIds.length > 0);
  const fallbackPricingItem: BrowseItem = pricingItem ?? {
    id: itemId,
    name: title,
    priceLabel,
    numericPrice,
    tags,
    detailRows,
    optionGroups: availableOptionGroups,
  };
  const currencyCode = orderConfig?.currency ?? "USD";
  const unpromotedItem = { ...browsePricingItem(fallbackPricingItem), promo_price: null, promotions: [] };
  const unpromotedUnitPrice = calculateSelectedMenuUnitPrice(unpromotedItem, selectedGroupInputs, { currency: currencyCode }).unitPrice;
  const oldUnpromotedUnitPrice = initialCartLine
    ? calculateSelectedMenuUnitPrice(
        unpromotedItem,
        browseOptionSelection(fallbackPricingItem, initialCartLine.selectedOptionIds, initialCartLine.selectedOptions),
        { currency: currencyCode }
      ).unitPrice
    : 0;
  const existingLinePreDiscount = initialCartLine
    ? calculateMenuLineTotal(oldUnpromotedUnitPrice, initialCartLine.quantity, currencyCode)
    : 0;
  const eligibleSubtotal = Math.max(
    0,
    (pricingSubtotal ?? 0) - existingLinePreDiscount + calculateMenuLineTotal(unpromotedUnitPrice, quantity, currencyCode)
  );
  const livePricing = calculateSelectedMenuUnitPrice(
    browsePricingItem(fallbackPricingItem),
    selectedGroupInputs,
    { currency: currencyCode, subtotal: eligibleSubtotal, promotions: fallbackPricingItem.promotions ?? [], organizerId: fallbackPricingItem.organizerId }
  );
  const totalUnitPrice = livePricing.unitPrice;
  const formattedBasePrice = formatMoney(livePricing.baseUnitPrice, orderConfig?.currency ?? "USD", locale);
  const formattedOriginalBasePrice = livePricing.discountPerUnit > 0
    ? formatMoney(livePricing.originalPrice, orderConfig?.currency ?? "USD", locale)
    : null;
  const discountPercent = livePricing.originalPrice > 0
    ? Math.round((livePricing.discountPerUnit / livePricing.originalPrice) * 100)
    : 0;
  const lineTotalFormatted = formatMoney(calculateMenuLineTotal(totalUnitPrice, quantity, orderConfig?.currency ?? "USD"), orderConfig?.currency ?? "USD", locale);
  const selectedOptionQuantities = availableOptionGroups.flatMap((group) =>
    (selectedOptions[group.id] || []).map((optionId) => ({
      groupId: group.id,
      optionId,
      qty: selectedOptionQtys[optionQuantityKey(group.id, optionId)] || 1,
    }))
  );

  const canAddToOrder = !isSoldOut && !orderConfig?.blocked;

  const addOrUpdateOrderLine = () => {
    if (!canAddToOrder || !onAddToOrder) return;
    const unsatisfied = availableOptionGroups.find((group) =>
      !isOptionGroupSelectionSatisfied(group, (selectedOptions[group.id] || []).length)
    );
    if (unsatisfied) {
      setMissingGroupId(unsatisfied.id);
      const groupElement = groupRefs.current.get(unsatisfied.id);
      groupElement?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      groupElement?.querySelector<HTMLElement>("input")?.focus();
      return;
    }
    const allSelected = selectedOptionQuantities.map((option) => option.optionId);
    onAddToOrder(itemId, allSelected, quantity, selectedOptionQuantities);
  };

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-end justify-center ${savannah ? "bg-[var(--tf-scrim)]/70 p-0 sm:p-4 sm:items-center" : "bg-black/50 p-0 sm:p-[var(--ps-space-6)] sm:items-center"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={savannah
          ? "relative max-w-full sm:max-w-[520px] max-h-[90dvh] w-full flex flex-col overflow-hidden rounded-t-xl sm:rounded-xl shadow-2xl bg-[var(--tf-base)] outline-none motion-reduce:transition-none"
          : "relative flex max-h-[90dvh] w-full max-w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xl outline-none motion-reduce:transition-none sm:max-w-[520px] sm:rounded-xl"}
      >
        {savannah ? (
          /* Savannah: Close button overlaid on top-right, no separate header bar */
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute right-3 top-3 z-20 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[var(--tf-base)] text-[var(--tf-on-base)] shadow-md border border-[var(--ps-border)] hover:bg-[var(--tf-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          /* Standard Header for non-Savannah */
          <div className="flex items-center justify-between gap-[var(--ps-space-3)] p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)] border-b border-[var(--ps-border)]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-[var(--ps-space-2)]">
                <h2 id={titleId} className="text-lg font-bold text-[var(--ps-text)]">
                  {title}
                </h2>
                {isSoldOut && labels.soldOut ? (
                  <span className="rounded-full bg-[var(--ps-neutral)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--ps-muted)] border border-[var(--ps-border)]">
                    {labels.soldOut}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--ps-border)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs font-semibold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Body - single scrollable container */}
        <div className={`min-h-0 flex-1 overflow-y-auto ${savannah ? "p-0" : "p-[var(--ps-space-6)] sm:p-[var(--ps-space-6)]"}`}>
          {savannah ? (
            /* Savannah Stacked Layout: edge-to-edge image on top, clean text below */
            <div className="flex flex-col">
              {image ? (
                <div className="relative aspect-[16/9] w-full max-h-[45dvh] sm:max-h-[55dvh] overflow-hidden bg-[var(--tf-soft)] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={title}
                    width={1200}
                    height={675}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
              ) : null}
              <div className="space-y-4 p-5 sm:p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id={titleId} className="font-[var(--v2-heading-font)] text-[24px] font-bold leading-tight text-[var(--tf-on-base)]">
                      {title}
                    </h2>
                    {isSoldOut && labels.soldOut ? (
                      <span className="rounded-none bg-[var(--tf-accent)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--tf-on-accent)]">
                        {labels.soldOut}
                      </span>
                    ) : null}
                  </div>
                  {priceLabel || typeof numericPrice === "number" ? (
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 text-[18px] font-bold text-[var(--tf-on-base)]">
                      <span>{formattedBasePrice}</span>
                      {formattedOriginalBasePrice ? <span className="text-sm font-normal text-[var(--ps-muted)] line-through">{formattedOriginalBasePrice}</span> : null}
                      {discountPercent > 0 ? <span className="rounded-full bg-[var(--tf-accent)] px-2 py-1 text-[11px] font-bold leading-none text-[var(--tf-on-accent)]">-{discountPercent}%</span> : null}
                    </div>
                  ) : null}
                </div>

                {description ? (
                  <p className="text-[16px] leading-relaxed text-[var(--ps-muted)]">
                    {description}
                  </p>
                ) : null}

                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tags.map((tag) => (
                      <span key={tag} className="bg-[var(--tf-subtle)] px-2.5 py-1 text-xs font-medium capitalize text-[var(--tf-on-subtle)]">
                        {tag.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Option groups */}
                {orderedOptionGroups.length > 0 ? (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ps-muted)]">
                      {labels.options || "Options"}
                    </h3>
                    <div className="space-y-3">
                      {orderedOptionGroups.map((group) => {
                        const currentSelected = selectedOptions[group.id] || [];
                        const isSingle = group.kind === "variant" || group.max === 1;

                        return (
                          <div key={group.id} ref={(node) => { if (node) groupRefs.current.set(group.id, node); else groupRefs.current.delete(group.id); }} className={`rounded-none border bg-[var(--tf-soft)] p-3 ${missingGroupId === group.id ? "border-2 border-[var(--tf-accent)] ring-2 ring-[var(--tf-accent)]" : "border-[var(--ps-border)]"}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-[var(--tf-on-base)]">{group.name}</span>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium ${group.required ? "bg-[var(--tf-accent)] text-[var(--tf-on-accent)]" : "bg-[var(--tf-subtle)] text-[var(--tf-on-soft)]"}`}
                              >
                                {describeBrowseOptionGroupRules(group, labels)}
                              </span>
                            </div>
                            {missingGroupId === group.id ? <p id={`group-error-${group.id}`} role="alert" className="mt-2 border-l-4 border-[var(--tf-accent)] pl-2 text-xs font-semibold text-[var(--tf-on-base)]">Choose {Math.max(1, group.min)} to continue</p> : null}
                            <div className="mt-2.5 space-y-2">
                              {group.options.map((opt) => {
                                const isChecked = currentSelected.includes(opt.id);
                                const optionQty = selectedOptionQtys[optionQuantityKey(group.id, opt.id)] || 1;

                                return (
                                  <div key={opt.id} className="flex items-center gap-2">
                                    <label
                                      className={`flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-xs p-2 rounded-none border transition cursor-pointer motion-reduce:transition-none ${
                                        isChecked
                                          ? "border-[var(--tf-accent)] bg-[var(--tf-accent-light)]/50 text-[var(--tf-on-accent)]"
                                          : "border-[var(--ps-border)] bg-[var(--tf-base)] text-[var(--tf-on-base)] hover:border-[var(--ps-border)]"
                                      }`}
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <input type={isSingle ? "radio" : "checkbox"} name={`group-${group.id}`} checked={isChecked} onChange={() => handleOptionToggle(group, opt.id)} aria-describedby={missingGroupId === group.id ? `group-error-${group.id}` : undefined} className="text-[var(--tf-on-accent)] focus:ring-[var(--tf-accent-hover)]" />
                                        {opt.imageUrl ? (
                                          <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={opt.imageUrl} alt={opt.name} width={48} height={48} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                          </>
                                        ) : null}
                                        <span className="min-w-0"><span className="block">{opt.name}</span>{opt.description ? <span className="mt-0.5 block text-[11px] font-normal text-[var(--tf-muted)]">{opt.description}</span> : null}{opt.allergens?.length ? <span className="mt-0.5 block text-[10px] font-medium text-[var(--tf-muted)]">Allergens: {opt.allergens.join(", ")}</span> : null}</span>
                                      </div>
                                      {opt.priceDeltaLabel ? (
                                        <span className="ml-2 shrink-0 font-medium text-[var(--tf-on-base)]">{opt.priceDeltaLabel}</span>
                                      ) : null}
                                    </label>
                                    {isChecked && (opt.maxQty ?? 1) > 1 ? (
                                      <div className="flex items-center gap-1">
                                        <button type="button" aria-label={`Decrease ${opt.name} quantity`} onClick={() => handleOptionQuantityChange(group, opt, optionQty - 1)} disabled={optionQty <= 1} className="h-11 w-11 rounded-none border border-[var(--ps-border)] disabled:opacity-40">−</button>
                                        <span className="min-w-5 text-center text-xs tabular-nums">{optionQty}</span>
                                        <button type="button" aria-label={`Increase ${opt.name} quantity`} onClick={() => handleOptionQuantityChange(group, opt, optionQty + 1)} disabled={optionQty >= (opt.maxQty ?? 1)} className="h-11 w-11 rounded-none border border-[var(--ps-border)] disabled:opacity-40">+</button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {detailRows.length > 0 ? (
                  <dl className="divide-y divide-[var(--ps-border)] border border-[var(--ps-border)]">
                    {detailRows.map((row, index) => (
                      <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-3 px-3 py-2">
                        <dt className="text-xs font-semibold text-[var(--tf-muted)]">{row.label}</dt>
                        <dd className="text-right text-xs font-medium text-[var(--tf-on-base)]">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </div>
          ) : (
            /* Non-Savannah two columns on desktop */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--ps-space-6)]">
              <div className={image ? "lg:col-span-1" : "hidden"}>
                {image ? (
                  <div className="aspect-[16/9] lg:aspect-[4/3] w-full overflow-hidden rounded-none bg-[var(--tf-soft)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt={title} width={1200} height={900} className="h-full w-full object-cover object-center" loading="lazy" />
                  </div>
                ) : null}
              </div>
              <div className={image ? "lg:col-span-1" : "lg:col-span-2"}>
                <div className="flex flex-wrap items-baseline gap-[var(--ps-space-2)]">
                  {priceLabel || typeof numericPrice === "number" ? <p className="text-base font-bold text-[var(--ps-text)]">{formattedBasePrice}</p> : null}
                  {formattedOriginalBasePrice ? <span className="text-sm font-normal text-[var(--ps-muted)] line-through">{formattedOriginalBasePrice}</span> : null}
                  {discountPercent > 0 ? <span className="rounded-full bg-[var(--ps-accent)] px-2 py-1 text-[11px] font-bold leading-none text-[var(--ps-accent-foreground)]">-{discountPercent}%</span> : null}
                </div>
                {description ? <p className="text-sm leading-6 text-[var(--ps-muted)]">{description}</p> : null}
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-[var(--ps-space-2)]">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-emerald-50 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium capitalize text-emerald-700">
                        {tag.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                ) : null}

                {orderedOptionGroups.length > 0 ? (
                  <div className="space-y-[var(--ps-space-3)] pt-[var(--ps-space-1)]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ps-muted)]">
                      {labels.options || "Options"}
                    </h3>
                    <div className="space-y-[var(--ps-space-3)]">
                      {orderedOptionGroups.map((group) => {
                        const currentSelected = selectedOptions[group.id] || [];
                        const isSingle = group.kind === "variant" || group.max === 1;

                        return (
                          <div key={group.id} ref={(node) => { if (node) groupRefs.current.set(group.id, node); else groupRefs.current.delete(group.id); }} className={`rounded-none border bg-[var(--tf-soft)] p-[var(--ps-space-3)] ${missingGroupId === group.id ? "border-2 border-[var(--tf-accent)] ring-2 ring-[var(--tf-accent)]" : "border-[var(--ps-border)]"}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-[var(--tf-on-base)]">{group.name}</span>
                              <span
                                className={`rounded-full px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium ${group.required ? "bg-[var(--tf-accent)] text-[var(--tf-on-accent)]" : "bg-[var(--tf-subtle)] text-[var(--tf-on-soft)]"}`}
                              >
                                {describeBrowseOptionGroupRules(group, labels)}
                              </span>
                            </div>
                            {missingGroupId === group.id ? <p id={`group-error-${group.id}`} role="alert" className="mt-2 border-l-4 border-[var(--tf-accent)] pl-2 text-xs font-semibold text-[var(--tf-on-base)]">Choose {Math.max(1, group.min)} to continue</p> : null}
                            <div className="mt-[var(--ps-space-3)] space-y-[var(--ps-space-2)]">
                              {group.options.map((opt) => {
                                const isChecked = currentSelected.includes(opt.id);
                                const optionQty = selectedOptionQtys[optionQuantityKey(group.id, opt.id)] || 1;

                                return (
                                  <div key={opt.id} className="flex items-center gap-[var(--ps-space-2)]">
                                    <label
                                      className={`flex min-h-11 min-w-0 flex-1 items-center justify-between gap-[var(--ps-space-2)] text-xs p-[var(--ps-space-2)] rounded-none border transition cursor-pointer motion-reduce:transition-none ${
                                        isChecked
                                          ? "border-[var(--tf-accent)] bg-[var(--tf-accent-light)]/50 text-[var(--tf-on-accent)]"
                                          : "border-[var(--ps-border)] bg-[var(--tf-base)] text-[var(--tf-on-base)] hover:border-[var(--ps-border)]"
                                      }`}
                                    >
                                      <div className="flex min-w-0 items-center gap-[var(--ps-space-2)]">
                                        <input type={isSingle ? "radio" : "checkbox"} name={`group-${group.id}`} checked={isChecked} onChange={() => handleOptionToggle(group, opt.id)} aria-describedby={missingGroupId === group.id ? `group-error-${group.id}` : undefined} className="text-[var(--tf-on-accent)] focus:ring-[var(--tf-accent-hover)]" />
                                        {opt.imageUrl ? (
                                          <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={opt.imageUrl} alt={opt.name} width={48} height={48} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                          </>
                                        ) : null}
                                        <span className="min-w-0"><span className="block">{opt.name}</span>{opt.description ? <span className="mt-0.5 block text-[11px] font-normal text-[var(--tf-muted)]">{opt.description}</span> : null}{opt.allergens?.length ? <span className="mt-0.5 block text-[10px] font-medium text-[var(--tf-muted)]">Allergens: {opt.allergens.join(", ")}</span> : null}</span>
                                      </div>
                                      {opt.priceDeltaLabel ? (
                                        <span className="ml-2 shrink-0 font-medium text-[var(--tf-on-base)]">{opt.priceDeltaLabel}</span>
                                      ) : null}
                                    </label>
                                    {isChecked && (opt.maxQty ?? 1) > 1 ? (
                                      <div className="flex items-center gap-1">
                                        <button type="button" aria-label={`Decrease ${opt.name} quantity`} onClick={() => handleOptionQuantityChange(group, opt, optionQty - 1)} disabled={optionQty <= 1} className="h-11 w-11 rounded-none border border-[var(--ps-border)] disabled:opacity-40">−</button>
                                        <span className="min-w-5 text-center text-xs tabular-nums">{optionQty}</span>
                                        <button type="button" aria-label={`Increase ${opt.name} quantity`} onClick={() => handleOptionQuantityChange(group, opt, optionQty + 1)} disabled={optionQty >= (opt.maxQty ?? 1)} className="h-11 w-11 rounded-none border border-[var(--ps-border)] disabled:opacity-40">+</button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {detailRows.length > 0 ? (
                  <dl className="divide-y divide-[var(--ps-border)] rounded-none border border-[var(--ps-border)]">
                    {detailRows.map((row, index) => (
                      <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-[var(--ps-space-3)] px-[var(--ps-space-3)] py-[var(--ps-space-2)]">
                        <dt className="text-xs font-semibold text-[var(--tf-muted)]">{row.label}</dt>
                        <dd className="text-right text-xs font-medium text-[var(--tf-on-base)]">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer - pinned */}
        <div className={`border-t border-[var(--ps-border)] bg-[var(--tf-base)] p-[var(--ps-space-4)] ${savannah ? "pb-[env(safe-area-inset-bottom)]" : ""}`}>
          {orderConfig?.enabled ? (
            <div className="space-y-[var(--ps-space-3)]">
              {!isSoldOut ? (
                <div className="flex items-center justify-between gap-[var(--ps-space-3)]">
                  <span className="text-xs font-semibold text-[var(--tf-muted)]">Quantity</span>
                  <div className="flex items-center rounded-none border border-[var(--ps-border)] bg-[var(--tf-base)] p-[var(--ps-space-1)]">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="flex h-11 w-11 items-center justify-center rounded-none border border-[var(--ps-border)] bg-[var(--tf-base)] text-[var(--tf-on-base)] shadow-xs hover:bg-[var(--tf-subtle)] disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-[var(--tf-on-base)]">{quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
                      disabled={quantity >= MAX_LINE_QUANTITY}
                      className="flex h-11 w-11 items-center justify-center rounded-none border border-[var(--ps-border)] bg-[var(--tf-base)] text-[var(--tf-on-base)] shadow-xs hover:bg-[var(--tf-subtle)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}
              {!isSoldOut && quantity >= MAX_LINE_QUANTITY ? (
                <p className="text-right text-xs text-[var(--tf-muted)]">{labels.quantityLimit || `Maximum ${MAX_LINE_QUANTITY} per item`}</p>
              ) : null}

              <span className="sr-only" aria-live="polite" aria-atomic="true">Total {lineTotalFormatted}</span>
              <button type="button" disabled={!canAddToOrder} onClick={addOrUpdateOrderLine} className={`ps-button ps-button-primary min-h-11 w-full text-center text-sm font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition motion-reduce:transition-none ${isSoldOut ? "opacity-60" : ""}`}>
                {isSoldOut ? labels.soldOut || "Sold out" : `${isEditing ? labels.updateOrder || "Update order" : labels.addToOrder || "Add to order"} · ${lineTotalFormatted}`}
              </button>
            </div>
          ) : action ? (
            <a href={action.href} className={`block rounded-none bg-[var(--tf-accent)] px-[var(--ps-space-4)] py-[var(--ps-space-3)] text-center text-sm font-bold text-[var(--tf-on-accent)] hover:bg-[var(--tf-accent-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]`}>{action.label}</a>
          ) : null}
        </div>
      </div>
    </div>
  );
}


function OrderDrawer({
  cart,
  orderConfig,
  allItems,
  labels,
  accentColor,
  savannah,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onEditItem,
  onOrderSuccess,
}: {
  cart: CartItem[];
  orderConfig: StorefrontOrderConfig;
  allItems: BrowseItem[];
  labels: StorefrontBrowseLabels;
  accentColor?: string;
  savannah: boolean;
  onClose: () => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onEditItem: (line: CartItem, trigger: HTMLButtonElement) => void;
  onOrderSuccess: (result: { orderNumber: string; trackingToken?: string | null; scheduledFor?: string | null; subtotal?: number | null; deliveryFee?: number | null; total?: number | null; fulfilmentType?: string | null; currency?: string | null }) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const itemsMap = new Map(allItems.map((it) => [it.id, it]));

  const offerings = orderConfig.offerings || ["pickup"];
  const allowsDelivery = offerings.includes("delivery");
  const allowsPickup = offerings.includes("pickup");
  const canPayOnline = orderConfig.onlinePayment === true;

  // Payment method: fulfilment always available; online only when gated.
  // Single available method renders without a choice.
  const [payMethod, setPayMethod] = useState<"fulfilment" | "online">("fulfilment");
  const [onlineSecret, setOnlineSecret] = useState<string | null>(null);
  const [onlineOrderNumber, setOnlineOrderNumber] = useState<string | null>(null);
  const [onlineTrackingToken, setOnlineTrackingToken] = useState<string | null>(null);
  const [onlineScheduledFor, setOnlineScheduledFor] = useState<string | null>(null);
  const [isStartingPayment, setIsStartingPayment] = useState(false);

  const [timingChoice, setTimingChoice] = useState<"asap" | "scheduled">(
    orderConfig.isClosed ? "scheduled" : "asap"
  );
  const [customScheduleTime, setCustomScheduleTime] = useState<string>("");

  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">(
    allowsPickup ? "pickup" : "delivery"
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [promoExpanded, setPromoExpanded] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoValidation, setPromoValidation] = useState<Extract<ValidatePromoCodeResult, { success: true; valid: true }> | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(`aldriva_promo_${orderConfig.slug}`);
      if (remembered) {
        setPromoCode(remembered);
        setPromoExpanded(true);
      }
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }, [orderConfig.slug]);

  useEffect(() => {
    setPromoValidation(null);
    setPromoError(null);
  }, [cart]);

  // Esc key closes drawer
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Subtotal calculation
  const cartPricing = useMemo(() => browseCartPricing(cart, allItems, orderConfig.currency), [cart, allItems, orderConfig.currency]);
  const automaticSubtotal = cartPricing.subtotal;
  const subtotal = promoValidation?.subtotal ?? automaticSubtotal;

  // Delivery fee preview (client-side only; server recomputes authoritatively on submit)
  const rawDeliveryFee = orderConfig.deliveryFee ?? 0;
  const freeAbove = orderConfig.freeDeliveryAbove ?? null;
  const displayDeliveryFee =
    fulfilment === "delivery"
      ? promoValidation?.freeDeliveryPromotionApplied || (freeAbove !== null && subtotal >= freeAbove)
        ? 0
        : rawDeliveryFee
      : 0;
  const grandTotal = subtotal + displayDeliveryFee;

  const formattedSubtotal = `${orderConfig.currency} ${subtotal.toFixed(2)}`;
  const formattedDeliveryFee =
    displayDeliveryFee === 0
      ? `${orderConfig.currency} 0.00`
      : `${orderConfig.currency} ${displayDeliveryFee.toFixed(2)}`;
  const formattedTotal = `${orderConfig.currency} ${grandTotal.toFixed(2)}`;

  const toOrderPayloadLines = () => cart.map((line) => ({
    itemId: line.itemId,
    selectedOptionIds: line.selectedOptionIds,
    selectedOptions: line.selectedOptions?.map((option) => ({
      ...(option.groupId ? { groupId: option.groupId } : {}),
      optionId: option.optionId,
      qty: option.qty,
    })),
    quantity: line.quantity,
  }));

  const applyPromoCode = async () => {
    const code = promoCode.trim();
    if (!code) {
      setPromoError("Enter a promo code.");
      return;
    }
    setIsValidatingPromo(true);
    setPromoError(null);
    try {
      const result = await validatePromoCode(orderConfig.slug, code, toOrderPayloadLines());
      if (!result.success || !result.valid) {
        setPromoValidation(null);
        setPromoError(result.success ? result.message : result.message);
        return;
      }
      setPromoValidation(result);
      try {
        localStorage.setItem(`aldriva_promo_${orderConfig.slug}`, code);
      } catch {
        // Storage is only a convenience; the server validates again at submit.
      }
    } catch {
      setPromoValidation(null);
      setPromoError("Promo code could not be checked. Please try again.");
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim()) {
      setErrorMessage(labels.fullName ? `Please enter your ${labels.fullName.toLowerCase()}` : "Please enter your name.");
      return;
    }

    if (!customerPhone.trim()) {
      setErrorMessage(labels.phone ? `Please enter your ${labels.phone.toLowerCase()}` : "Please enter your phone number.");
      return;
    }

    if (fulfilment === "delivery" && (!deliveryAddress.trim() || deliveryAddress.trim().length < 5)) {
      setErrorMessage(labels.deliveryAddress ? `Please enter a valid ${labels.deliveryAddress.toLowerCase()}` : "Please enter a delivery address.");
      return;
    }

    const scheduledForPayload = orderConfig.isClosed
      ? (orderConfig.scheduledFor ?? null)
      : timingChoice === "scheduled" && customScheduleTime
      ? new Date(customScheduleTime).toISOString()
      : null;

    const payloadItems = toOrderPayloadLines();
    const submittedCode = promoCode.trim();
    setIsValidatingPromo(true);
    let latestPreview: Extract<ValidatePromoCodeResult, { success: true; valid: true }>;
    try {
      const previewResult = await validatePromoCode(orderConfig.slug, submittedCode, payloadItems);
      if (!previewResult.success || !previewResult.valid) {
        const message = previewResult.success ? previewResult.message : previewResult.message;
        setPromoError(message);
        setErrorMessage(message);
        setIsValidatingPromo(false);
        return;
      }
      latestPreview = previewResult;
    } catch {
      setPromoError("Promo code could not be checked. Please try again.");
      setErrorMessage("Prices could not be checked. Please try again.");
      setIsValidatingPromo(false);
      return;
    }
    setIsValidatingPromo(false);
    const displayedLineTotals = cart.map((_, index) => promoValidation?.lines[index]?.lineTotal ?? cartPricing.lines[index]?.lineTotal ?? 0);
    const linePricesChanged = latestPreview.lines.some((line, index) => Math.abs((displayedLineTotals[index] ?? 0) - line.lineTotal) > 0.0001);
    const freeDeliveryForPreview = latestPreview.freeDeliveryPromotionApplied || (freeAbove !== null && latestPreview.subtotal >= freeAbove);
    const latestDeliveryFee = fulfilment === "delivery" ? (freeDeliveryForPreview ? 0 : rawDeliveryFee) : 0;
    const checkoutPriceChanged = linePricesChanged || Math.abs(latestPreview.subtotal - subtotal) > 0.0001 || Math.abs(latestDeliveryFee - displayDeliveryFee) > 0.0001;
    setPromoValidation(latestPreview);
    setPromoError(null);
    if (checkoutPriceChanged) {
      setErrorMessage("Price updated. We refreshed the item prices and discounts. Review your order, then place it again.");
      return;
    }
    if (submittedCode) {
      try { localStorage.setItem(`aldriva_promo_${orderConfig.slug}`, submittedCode); } catch { /* Best-effort reference only. */ }
    } else {
      try { localStorage.removeItem(`aldriva_promo_${orderConfig.slug}`); } catch { /* Storage is optional. */ }
    }
    // Idempotency key per submission attempt
    const idempotencyKey = `cart_${orderConfig.slug}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Online card payment: create the unpaid order + PaymentIntent, then
    // collect the card in-page. The cart clears only after confirmed payment.
    if (payMethod === "online") {
      setIsStartingPayment(true);
      try {
        const intentRes = await fetch("/api/orders/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: orderConfig.slug,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            customerEmail: customerEmail.trim() || null,
            fulfilmentType: fulfilment,
            deliveryAddress: fulfilment === "delivery" ? deliveryAddress.trim() : null,
            customerNote: customerNote.trim() || null,
            items: payloadItems,
            promoCode: submittedCode || null,
            idempotencyKey,
            hp: honeypot || null,
            scheduledFor: scheduledForPayload,
          }),
        });
        const intentData = await intentRes.json().catch(() => ({}));
        if (!intentRes.ok || !intentData.clientSecret) {
          setErrorMessage(intentData.error || "Could not start the card payment. Please try again.");
          setIsStartingPayment(false);
          return;
        }
        setOnlineOrderNumber(intentData.orderNumber);
        setOnlineTrackingToken(intentData.trackingToken ?? null);
        setOnlineScheduledFor(intentData.scheduledFor ?? null);
        setOnlineSecret(intentData.clientSecret);
        setIsStartingPayment(false);
        return;
      } catch {
        setErrorMessage("An unexpected network error occurred. Please try again.");
        setIsStartingPayment(false);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await submitOrderRequest({
        slug: orderConfig.slug,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || null,
        fulfilmentType: fulfilment,
        deliveryAddress: fulfilment === "delivery" ? deliveryAddress.trim() : null,
        customerNote: customerNote.trim() || null,
        items: payloadItems,
        promoCode: submittedCode || null,
        idempotencyKey,
        hp: honeypot || null,
        scheduledFor: scheduledForPayload,
      });

      if (!res.success) {
        if (res.error === "unknown_option") {
          setErrorMessage(
            res.message || "One of the selected options is no longer available. Please review your order and try again."
          );
        } else {
          setErrorMessage(res.message || "Failed to place order. Please try again.");
        }
        setIsSubmitting(false);
        return;
      }

      onOrderSuccess({
        orderNumber: res.orderNumber,
        trackingToken: res.trackingToken,
        scheduledFor: res.scheduledFor,
        subtotal,
        deliveryFee: displayDeliveryFee,
        total: grandTotal,
        fulfilmentType: fulfilment,
        currency: orderConfig.currency,
      });
    } catch {
      setErrorMessage("An unexpected network error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  // Card-payment step: the unpaid order exists; collect the card. Success
  // arrives via PaymentForm only after Stripe confirms — that is when the
  // cart clears (see onOrderSuccess).
  if (onlineSecret && onlineOrderNumber) {
    return (
      <div
        className={`fixed inset-0 z-[80] flex items-end justify-center ${savannah ? "bg-[var(--tf-scrim)]/70" : "bg-black/50"} p-0 sm:items-center sm:p-[var(--ps-space-6)]`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          className={`max-h-[90dvh] w-full max-w-lg flex flex-col ${savannah ? "rounded-none bg-[var(--tf-base)] shadow-none" : "rounded-t-2xl bg-[var(--ps-surface)] shadow-2xl sm:rounded-2xl"} outline-none`}
        >
          <div className="flex items-center justify-between border-b border-[var(--ps-border)] p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)]">
            <h2 className="text-base font-bold text-[var(--ps-text)]">{labels.payOnline || "Pay online"}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-[var(--ps-space-2)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] hover:text-[var(--ps-muted)]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)] space-y-[var(--ps-space-4)]">
            <div className="flex items-center justify-between text-sm font-bold text-[var(--ps-text)]">
              <span>{labels.total || "Total"}</span>
              <span className="text-[var(--ps-accent-hover)]">{formattedTotal}</span>
            </div>
            {errorMessage ? (
              <div className={savannah ? "bg-[var(--tf-subtle)] p-[var(--ps-space-3)] text-xs font-medium text-[var(--tf-ink)]" : "rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-3)] text-xs font-medium text-red-700"}>
                {errorMessage}
              </div>
            ) : null}
            <StripeProvider clientSecret={onlineSecret} {...(accentColor ? { accentColor } : {})}>
              <PaymentForm
                onSuccess={() => {
                  onOrderSuccess({
                    orderNumber: onlineOrderNumber,
                    trackingToken: onlineTrackingToken,
                    scheduledFor: onlineScheduledFor,
                    subtotal,
                    deliveryFee: displayDeliveryFee,
                    total: grandTotal,
                    fulfilmentType: fulfilment,
                    currency: orderConfig.currency,
                  });
                }}
                onBack={() => {
                  setOnlineSecret(null);
                  setOnlineOrderNumber(null);
                }}
                submitLabel={`${labels.payOnline || "Pay online"} • ${formattedTotal}`}
                {...(accentColor ? { accentColor } : {})}
                hideInputs
              />
            </StripeProvider>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-end justify-center ${savannah ? "bg-[var(--tf-scrim)]/70" : "bg-black/50"} p-0 sm:items-center sm:p-[var(--ps-space-6)]`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`max-h-[90dvh] w-full max-w-lg flex flex-col ${savannah ? "rounded-none bg-[var(--tf-base)] shadow-none" : "rounded-t-2xl bg-[var(--ps-surface)] shadow-2xl sm:rounded-2xl"} outline-none`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--ps-border)] p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)]">
          <h2 className="text-base font-bold text-[var(--ps-text)]">{labels.yourOrder || "Your order"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-[var(--ps-space-2)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] hover:text-[var(--ps-muted)]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)] space-y-[var(--ps-space-6)]">
          {/* Closed Restaurant Notice */}
          {orderConfig.isClosed ? (
            <div className={savannah ? "bg-[var(--tf-subtle)] p-[var(--ps-space-3)] text-xs text-[var(--tf-ink)]" : "rounded-xl border border-amber-200 bg-amber-50 p-[var(--ps-space-3)] text-xs text-amber-900"}>
              <div className="font-bold flex items-center gap-[var(--ps-space-2)]">
                <svg className={`h-4 w-4 shrink-0 ${savannah ? "text-[var(--tf-accent-deep)]" : "text-amber-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Notice: Restaurant Closed</span>
              </div>
              <p className={`mt-[var(--ps-space-1)] ${savannah ? "text-[var(--tf-ink)]" : "text-amber-800"}`}>
                {orderConfig.scheduledFor
                  ? `Your order will be accepted and prepared for reopening on ${new Date(orderConfig.scheduledFor).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
                  : labels.scheduledNotice || "The restaurant is currently closed. Your order will be prepared for reopening."}
              </p>
            </div>
          ) : null}

          {/* Cart items list */}
          <div className="space-y-[var(--ps-space-3)]">
            {cart.map((line, index) => {
              const it = itemsMap.get(line.itemId);
              if (!it) return null;

              const chosenOptions = (it.optionGroups || []).flatMap((group) =>
                group.options.flatMap((option) => {
                  const selected = line.selectedOptions.find((entry) => entry.optionId === option.id && entry.groupId === group.id);
                  if (!selected) return [];
                  return [{ group, option, qty: selected.qty }];
                })
              );
              const automaticLine = cartPricing.lines[index];
              const codeLine = promoValidation?.lines[index];
              const itemTotal = codeLine?.lineTotal ?? automaticLine?.lineTotal ?? calculateMenuLineTotal(browseLineUnitPrice(it, line.selectedOptionIds, line.selectedOptions, orderConfig.currency), line.quantity, orderConfig.currency);
              const lineUnitPrice = automaticLine ? automaticLine.unitPrice + automaticLine.optionsDelta : browseLineUnitPrice(it, line.selectedOptionIds, line.selectedOptions, orderConfig.currency);
              const priceUpdated = Boolean(line.priceVersion && line.priceVersion !== createStorefrontPriceVersion(lineUnitPrice));
              const discountPerUnit = codeLine?.discountPerUnit ?? automaticLine?.discountPerUnit ?? 0;
              const promotionName = codeLine?.promotionName ?? automaticLine?.appliedPromotion?.name ?? null;

              return (
                <div key={line.lineId} className="flex items-start justify-between gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)]/60 p-[var(--ps-space-3)]">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--ps-text)]">{it.name}</p>
                    {chosenOptions.length > 0 ? (
                      <div className="mt-[var(--ps-space-1)] flex flex-wrap gap-1.5">
                        {chosenOptions.map(({ group, option, qty }) => (
                          <span key={`${group.id}:${option.id}`} className="inline-flex flex-wrap items-baseline gap-1 rounded-md bg-[var(--ps-surface)] px-2 py-1 text-xs text-[var(--ps-text)]">
                            <span className="text-[10px] font-semibold text-[var(--ps-muted)]">{group.name}</span>
                            <span>{option.name}{qty > 1 ? ` × ${qty}` : ""}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {priceUpdated ? <p className="mt-1 text-xs font-semibold text-[var(--ps-accent-hover)]">Price updated</p> : null}
                    <p className="text-xs font-semibold text-[var(--ps-accent-hover)] mt-[var(--ps-space-1)]">
                      {orderConfig.currency} {itemTotal.toFixed(2)}
                    </p>
                    {discountPerUnit > 0 ? <p className="mt-1 text-xs font-medium text-emerald-700">{promotionName || "Discount applied"} · save {orderConfig.currency} {calculateMenuLineTotal(discountPerUnit, line.quantity, orderConfig.currency).toFixed(2)}</p> : null}
                    <button type="button" data-cart-edit-id={line.lineId} onClick={(event) => onEditItem(line, event.currentTarget)} className="mt-2 min-h-11 rounded-lg px-3 text-xs font-semibold text-[var(--ps-accent-hover)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]">Edit</button>
                  </div>
                  <div className="flex items-center gap-[var(--ps-space-2)]">
                    <div className="flex items-center rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-1)] shadow-xs">
                      <button
                        type="button"
                        aria-label={`Decrease ${it.name} quantity`}
                        onClick={() => onUpdateQuantity(index, line.quantity - 1)}
                        className="h-11 w-11 rounded flex items-center justify-center text-xs font-bold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-[var(--ps-text)]">{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${it.name} quantity`}
                        onClick={() => onUpdateQuantity(index, line.quantity + 1)}
                        disabled={line.quantity >= MAX_LINE_QUANTITY}
                        className="h-11 w-11 rounded flex items-center justify-center text-xs font-bold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    {line.quantity >= MAX_LINE_QUANTITY ? (
                      <p className="mt-1 text-right text-[10px] text-[var(--ps-muted)]">{labels.quantityLimit || `Maximum ${MAX_LINE_QUANTITY} per item`}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="flex min-h-11 min-w-11 items-center justify-center text-[var(--ps-muted)] hover:text-red-500 p-[var(--ps-space-1)]"
                      aria-label="Remove item"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-[var(--ps-space-4)] pt-[var(--ps-space-2)]">
            <div className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-3)]">
              <button
                type="button"
                aria-expanded={promoExpanded}
                onClick={() => setPromoExpanded((expanded) => !expanded)}
                className="min-h-11 w-full text-left text-xs font-semibold text-[var(--ps-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
              >
                {promoExpanded ? "Promo code" : "Have a promo code?"}
              </button>
              {promoExpanded ? (
                <div className="space-y-[var(--ps-space-2)]">
                  <label htmlFor={`promo-code-${orderConfig.slug}`} className="block text-xs font-semibold text-[var(--ps-muted)]">Enter promo code</label>
                  <div className="flex flex-wrap gap-[var(--ps-space-2)]">
                    <input
                      id={`promo-code-${orderConfig.slug}`}
                      type="text"
                      autoComplete="off"
                      value={promoCode}
                      onChange={(event) => { setPromoCode(event.currentTarget.value); setPromoValidation(null); setPromoError(null); }}
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] text-xs uppercase text-[var(--ps-text)] focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                    />
                    <button type="button" disabled={isValidatingPromo || !promoCode.trim()} onClick={applyPromoCode} className="ps-button ps-button-secondary min-h-11 px-4 text-xs font-bold disabled:opacity-50">
                      {isValidatingPromo ? "Checking…" : "Apply"}
                    </button>
                    {promoCode ? <button type="button" onClick={() => { setPromoCode(""); setPromoValidation(null); setPromoError(null); try { localStorage.removeItem(`aldriva_promo_${orderConfig.slug}`); } catch { /* Optional storage. */ } }} className="min-h-11 px-3 text-xs font-semibold text-[var(--ps-muted)] underline">Remove</button> : null}
                  </div>
                  {promoError ? <p role="alert" className="text-xs font-medium text-red-700">{promoError}</p> : null}
                  {promoValidation ? <p role="status" className="text-xs font-medium text-emerald-700">Code checked. Promotion prices are shown in your order.</p> : null}
                </div>
              ) : null}
            </div>
            {/* Fulfilment selector */}
            {allowsDelivery && allowsPickup ? (
              <div className="space-y-[var(--ps-space-2)]">
                <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.fulfilment || "Fulfilment"}</label>
                <div className="grid grid-cols-2 gap-[var(--ps-space-2)]">
                  <button
                    type="button"
                    onClick={() => setFulfilment("pickup")}
                    className={`rounded-xl border py-[var(--ps-space-2)] px-[var(--ps-space-3)] text-xs font-bold transition ${
                      fulfilment === "pickup"
                        ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                        : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                    }`}
                  >
                    {labels.pickup || "Pickup"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfilment("delivery")}
                    className={`rounded-xl border py-[var(--ps-space-2)] px-[var(--ps-space-3)] text-xs font-bold transition ${
                      fulfilment === "delivery"
                        ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                        : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                    }`}
                  >
                    {labels.delivery || "Delivery"}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Delivery address */}
            {fulfilment === "delivery" ? (
              <div className="space-y-[var(--ps-space-1)]">
                <label className="text-xs font-bold text-[var(--ps-muted)]">
                  {labels.deliveryAddress || "Delivery address"} *
                </label>
                <input
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={labels.deliveryAddressPlaceholder || "Street address, apartment, city"}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs shadow-xs focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                />
                <p className="text-xs text-[var(--ps-muted)]">
                  {rawDeliveryFee > 0
                    ? freeAbove !== null && subtotal >= freeAbove
                      ? labels.freeDelivery || "Free delivery on this order 🎉"
                      : `${labels.deliveryFee || "Delivery fee"}: ${formattedDeliveryFee}`
                    : labels.freeDelivery || "Free delivery"}
                </p>
                {fulfilment === "delivery" &&
                freeAbove !== null &&
                rawDeliveryFee > 0 &&
                subtotal < freeAbove ? (
                  <p className="text-xs font-medium text-[var(--ps-accent-hover)]">
                    {(labels.freeDeliveryProgress || "Add {amount} more for free delivery").replace(
                      "{amount}",
                      `${orderConfig.currency} ${(freeAbove - subtotal).toFixed(2)}`
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Timing selection */}
            <div className="space-y-[var(--ps-space-2)]">
              <label className="text-xs font-bold text-[var(--ps-muted)]">Timing</label>
              {orderConfig.isClosed ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-[var(--ps-space-3)] text-xs text-amber-900">
                  <p className="font-semibold">{labels.scheduledNotice || "The restaurant is closed. Your order will be prepared for reopening."}</p>
                  {orderConfig.scheduledFor ? (
                    <p className="mt-[var(--ps-space-1)] text-amber-800">
                      Reopening slot: {new Date(orderConfig.scheduledFor).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-[var(--ps-space-2)]">
                  <div className="grid grid-cols-2 gap-[var(--ps-space-2)]">
                    <button
                      type="button"
                      onClick={() => setTimingChoice("asap")}
                      className={`rounded-xl border py-[var(--ps-space-2)] px-[var(--ps-space-3)] text-xs font-bold transition ${
                        timingChoice === "asap"
                          ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                          : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                      }`}
                    >
                      {labels.asap || "As soon as possible"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimingChoice("scheduled")}
                      className={`rounded-xl border py-[var(--ps-space-2)] px-[var(--ps-space-3)] text-xs font-bold transition ${
                        timingChoice === "scheduled"
                          ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                          : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                      }`}
                    >
                      {labels.scheduleForLater || "Schedule for later"}
                    </button>
                  </div>

                  {timingChoice === "scheduled" ? (
                    <div className="space-y-[var(--ps-space-1)]">
                      <label className="text-xs font-semibold text-[var(--ps-muted)]">
                        {labels.chooseDate || "Date & Time"} *
                      </label>
                      <input
                        type="datetime-local"
                        required={timingChoice === "scheduled"}
                        value={customScheduleTime}
                        onChange={(e) => setCustomScheduleTime(e.target.value)}
                        min={new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 16)}
                        max={new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16)}
                        className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs shadow-xs focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="space-y-[var(--ps-space-2)]">
              <span className="text-xs font-bold text-[var(--ps-muted)]">
                {labels.customerDetails || "Your details"}
              </span>
              <div className="space-y-[var(--ps-space-2)]">
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={`${labels.fullName || "Full name"} *`}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs shadow-xs focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                />
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={`${labels.phone || "Phone number"} (e.g. +225 07000000) *`}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs shadow-xs focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                />
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder={labels.email || "Email (optional)"}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs shadow-xs focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                />
                <textarea
                  rows={2}
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder={labels.orderNotePlaceholder || "Special requests, allergies…"}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs shadow-xs focus:border-[var(--ps-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--ps-accent-hover)]"
                />
                <p className="text-xs text-[var(--ps-muted)]">
                  {labels.orderNoteHint || "Food preferences and preparation instructions only. Phone and address have separate fields."}
                </p>
              </div>
            </div>

            {/* Payment method (choice only when online payment is available) */}
            {canPayOnline ? (
              <div className="space-y-[var(--ps-space-2)]">
                <label className="text-xs font-bold text-[var(--ps-muted)]">{labels.paymentMethod || "Payment method"}</label>
                <div className="grid grid-cols-2 gap-[var(--ps-space-2)]">
                  <button
                    type="button"
                    onClick={() => setPayMethod("fulfilment")}
                    className={`rounded-xl border py-[var(--ps-space-2)] px-[var(--ps-space-3)] text-xs font-bold transition ${
                      payMethod === "fulfilment"
                        ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                        : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                    }`}
                  >
                    {labels.paymentOnFulfilment || "Payment upon pickup/delivery"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod("online")}
                    className={`rounded-xl border py-[var(--ps-space-2)] px-[var(--ps-space-3)] text-xs font-bold transition ${
                      payMethod === "online"
                        ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                        : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                    }`}
                  >
                    {labels.payOnline || "Pay online"}
                  </button>
                </div>
                {payMethod === "online" ? (
                  <p className="text-xs text-[var(--ps-muted)]">
                    {labels.onlinePaymentNotice || "You will pay by card now."}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Honeypot field (hidden) */}
            <div style={{ display: "none" }} aria-hidden="true">
              <input
                type="text"
                name="website_url"
                tabIndex={-1}
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Error Message */}
            {errorMessage ? (
              <div className={savannah ? "bg-[var(--tf-subtle)] p-[var(--ps-space-3)] text-xs font-medium text-[var(--tf-ink)]" : "rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-3)] text-xs font-medium text-red-700"}>
                {errorMessage}
              </div>
            ) : null}

            {/* Total and Submit */}
            <div className="border-t border-[var(--ps-border)] pt-[var(--ps-space-3)] space-y-[var(--ps-space-3)]">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--ps-muted)]">
                <span>{labels.subtotal || "Subtotal"}</span>
                <span>{formattedSubtotal}</span>
              </div>
              {fulfilment === "delivery" ? (
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--ps-muted)]">
                  <span>{labels.deliveryFee || "Delivery fee"}</span>
                  <span>
                    {displayDeliveryFee === 0 ? (
                      <span className={savannah ? "text-[var(--tf-accent-deep)]" : "text-green-600"}>{labels.freeDelivery || "Free"}</span>
                    ) : (
                      formattedDeliveryFee
                    )}
                  </span>
                </div>
              ) : null}
              {fulfilment === "delivery" &&
              freeAbove !== null &&
              rawDeliveryFee > 0 &&
              subtotal < freeAbove ? (
                <p className="text-xs font-medium text-[var(--ps-accent-hover)]">
                  {(labels.freeDeliveryProgress || "Add {amount} more for free delivery").replace(
                    "{amount}",
                    `${orderConfig.currency} ${(freeAbove - subtotal).toFixed(2)}`
                  )}
                </p>
              ) : null}
              <div className="flex items-center justify-between text-sm font-bold text-[var(--ps-text)]">
                <span>{labels.total || "Total"}</span>
                <span className="text-[var(--ps-accent-hover)]">{formattedTotal}</span>
              </div>
              <p className="text-xs text-[var(--ps-muted)]">
                {payMethod === "online"
                  ? labels.onlinePaymentNotice || "You will pay by card now."
                  : labels.paymentOnFulfilment || "Payment upon pickup/delivery"}
              </p>

              <button
                type="submit"
                disabled={isSubmitting || isStartingPayment || cart.length === 0}
          className="ps-button ps-button-primary w-full text-center text-sm font-bold shadow-xs disabled:opacity-40 transition"
              >
                {isSubmitting || isStartingPayment
                  ? payMethod === "online"
                    ? labels.payingOnline || "Preparing secure payment…"
                    : labels.placingOrder || "Placing order…"
                  : payMethod === "online"
                    ? `${labels.payOnline || "Pay online"} • ${formattedTotal}`
                    : `${labels.placeOrder || "Place order"} • ${formattedTotal}`}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}

function OrderConfirmationModal({
  orderNumber,
  trackingToken,
  slug,
  scheduledFor,
  subtotal,
  deliveryFee,
  total,
  fulfilmentType,
  currency,
  labels,
  tableFlame,
  savannah,
  onClose,
}: {
  orderNumber: string;
  trackingToken?: string | null;
  slug: string;
  scheduledFor?: string | null;
  subtotal?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
  fulfilmentType?: string | null;
  currency?: string | null;
  labels: StorefrontBrowseLabels;
  tableFlame: boolean;
  savannah: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (trackingToken && slug && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `aldriva_active_order_${slug}`,
          JSON.stringify({
            token: trackingToken,
            orderNumber,
            scheduledFor: scheduledFor ?? null,
            savedAt: Date.now(),
          })
        );
      } catch {
        // Storage unavailable (private browsing)
      }
    }
  }, [trackingToken, slug, orderNumber, scheduledFor]);

  const handleCopyLink = () => {
    if (typeof window === "undefined" || !trackingToken) return;
    const url = `${window.location.origin}/site/${slug}/orders/${trackingToken}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center ${savannah ? "bg-[var(--tf-scrim)]/80" : "bg-black/60"} p-[var(--ps-space-4)]`}>
      <div className={`w-full max-w-sm ${savannah ? "bg-[var(--tf-base)] shadow-none" : "rounded-2xl bg-[var(--ps-surface)] shadow-2xl"} p-[var(--ps-space-6)] text-center space-y-[var(--ps-space-4)]`}>
        <div className={`mx-auto flex h-14 w-14 items-center justify-center ${savannah ? "bg-[var(--tf-subtle)] text-[var(--tf-accent-deep)]" : "rounded-full bg-emerald-100 text-emerald-600"}`}>
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--ps-text)]">
            {labels.orderSuccessTitle || "Order requested!"}
          </h3>
          <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">
            {labels.orderSuccessSubtext || "We have received your order request."}
          </p>
        </div>

        <div className="rounded-xl bg-[var(--ps-neutral)] p-[var(--ps-space-4)] border border-[var(--ps-border)]">
          <p className="text-xs font-semibold text-[var(--ps-muted)] uppercase tracking-wider">
            {labels.orderNumber || "Order number"}
          </p>
          <p className="text-base font-extrabold text-[var(--ps-accent-hover)] mt-[var(--ps-space-1)]">{orderNumber}</p>
          {typeof subtotal === "number" && typeof total === "number" ? (
            <div className="mt-[var(--ps-space-2)] space-y-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">
              <div className="flex items-center justify-between">
                <span>{labels.subtotal || "Subtotal"}</span>
                <span className="tabular-nums">
                  {currency} {subtotal.toFixed(2)}
                </span>
              </div>
              {fulfilmentType === "delivery" ? (
                <div className="flex items-center justify-between">
                  <span>{labels.deliveryFee || "Delivery fee"}</span>
                  <span className="tabular-nums">
                    {(deliveryFee ?? 0) === 0 ? (
                      <span className={savannah ? "text-[var(--tf-accent-deep)]" : "text-green-600"}>{labels.freeDelivery || "Free"}</span>
                    ) : (
                      `${currency} ${(deliveryFee ?? 0).toFixed(2)}`
                    )}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-[var(--ps-space-1)] border-t border-[var(--ps-border)] text-sm font-bold text-[var(--ps-text)]">
                <span>{labels.total || "Total"}</span>
                <span className="tabular-nums">
                  {currency} {total.toFixed(2)}
                </span>
              </div>
            </div>
          ) : null}
          {scheduledFor ? (
            <p className="mt-[var(--ps-space-2)] text-xs text-[var(--ps-muted)]">
              Scheduled for: {new Date(scheduledFor).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
        </div>

        {trackingToken ? (
          <div className="space-y-[var(--ps-space-2)]">
            <a
              href={`/site/${slug}/orders/${trackingToken}`}
        className="ps-button ps-button-primary w-full flex items-center justify-center text-xs font-bold shadow-xs transition"
            >
              {labels.trackOrder || "Track my order"}
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] py-[var(--ps-space-2)] text-xs font-semibold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] transition"
            >
              {copied
                ? labels.trackingLinkCopied || "Link copied!"
                : labels.copyTrackingLink || "Copy tracking link"}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className={`w-full bg-[var(--ps-text)] py-[var(--ps-space-3)] text-xs font-bold ${savannah ? "rounded-none text-[var(--tf-on-ink)] hover:bg-[var(--tf-subtle)]" : `rounded-xl ${tableFlame ? "text-[var(--tf-on-ink)]" : "text-white"} hover:bg-[var(--ps-muted)]`} transition`}
        >
          {labels.backToMenu || "Back to menu"}
        </button>
      </div>
    </div>
  );
}
