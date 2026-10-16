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

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  BROWSE_ALL_GROUP,
  filterBrowseGroups,
  type BrowseGroup,
  type BrowseItem,
  type BrowseOptionGroup,
} from "@/lib/storefront-browse";
import { submitOrderRequest } from "@/lib/actions/orders";
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

export interface CartItem {
  itemId: string;
  selectedOptionIds: string[];
  quantity: number;
}

interface StorefrontBrowseProps {
  groups: BrowseGroup[];
  labels: StorefrontBrowseLabels;
  /** No chips row when there is a single category (search still shows). */
  showGroups: boolean;
  emptyHint?: string;
  itemMode?: "details" | "links";
  categoryTiles?: boolean;
  pageSize?: number;
  orderConfig?: StorefrontOrderConfig;
  accentColor?: string;
  children: React.ReactNode;
}

function loadCart(slug: string): CartItem[] {
  if (typeof window === "undefined" || !slug) return [];
  try {
    const raw = localStorage.getItem(`aldriva_cart_${slug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.itemId === "string" &&
        Array.isArray(item.selectedOptionIds) &&
        typeof item.quantity === "number" &&
        item.quantity > 0
    );
  } catch {
    return [];
  }
}

function saveCart(slug: string, cart: CartItem[]): void {
  if (typeof window === "undefined" || !slug) return;
  try {
    localStorage.setItem(`aldriva_cart_${slug}`, JSON.stringify(cart));
  } catch {
    // quota exceeded or private mode, silently ignore
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}

export function StorefrontBrowse({
  groups,
  labels,
  showGroups,
  orderConfig,
  accentColor,
  children,
  itemMode = "details",
  categoryTiles = false,
  pageSize,
}: StorefrontBrowseProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(BROWSE_ALL_GROUP);
  const [visibleItemCount, setVisibleItemCount] = useState(Math.max(1, pageSize ?? 12));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
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
  const searchId = useId();
  const chipsId = useId();

  useEffect(() => {
    setMounted(true);
    if (orderConfig?.enabled && orderConfig.slug) {
      setCart(loadCart(orderConfig.slug));
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
  }, [orderConfig?.enabled, orderConfig?.slug]);

  // Before hydration (and without JS): server static markup only.
  if (!mounted) return <>{children}</>;

  if (groups.length === 0) return <>{children}</>;

  const visible = filterBrowseGroups(groups, query, activeGroup);
  const engaged = query.trim() !== "" || activeGroup !== BROWSE_ALL_GROUP;
  const categoryGroups = categoryTiles ? groups.filter((group) => group.id !== "uncategorized") : groups;
  const visibleCount = itemMode === "links" ? visibleItemCount : Number.POSITIVE_INFINITY;
  let remaining = visibleCount;
  const pagedVisible = visible.flatMap((group) => {
    const items = group.items.slice(0, remaining);
    remaining -= items.length;
    return items.length ? [{ ...group, items }] : [];
  });
  const totalVisibleItems = visible.reduce((count, group) => count + group.items.length, 0);
  const allItems = groups.flatMap((group) => group.items);
  const selected = selectedId
    ? allItems.find((item) => item.id === selectedId) ?? null
    : null;

  const reset = () => {
    setQuery("");
    setActiveGroup(BROWSE_ALL_GROUP);
    setVisibleItemCount(Math.max(1, pageSize ?? 12));
  };

  const openSheet = (id: string, trigger: HTMLElement | null) => {
    triggerRef.current = trigger;
    setSelectedId(id);
  };

  const closeSheet = () => {
    setSelectedId(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  };

  const updateCart = (nextCart: CartItem[]) => {
    setCart(nextCart);
    if (orderConfig?.slug) {
      saveCart(orderConfig.slug, nextCart);
    }
  };

  const handleAddToOrder = (
    itemId: string,
    selectedOptionIds: string[],
    quantity: number
  ) => {
    const existingIndex = cart.findIndex(
      (c) => c.itemId === itemId && arraysEqual(c.selectedOptionIds, selectedOptionIds)
    );
    let nextCart: CartItem[];
    if (existingIndex >= 0) {
      nextCart = cart.map((c, i) =>
        i === existingIndex ? { ...c, quantity: c.quantity + quantity } : c
      );
    } else {
      nextCart = [...cart, { itemId, selectedOptionIds, quantity }];
    }
    updateCart(nextCart);
    closeSheet();
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Compute cart subtotal from items
  const itemsMap = new Map(allItems.map((it) => [it.id, it]));
  const cartSubtotal = cart.reduce((sum, line) => {
    const it = itemsMap.get(line.itemId);
    if (!it) return sum;
    const base = typeof it.numericPrice === "number" ? it.numericPrice : 0;
    let deltas = 0;
    const optSet = new Set(line.selectedOptionIds);
    for (const group of it.optionGroups || []) {
      for (const opt of group.options) {
        if (optSet.has(opt.id) && typeof opt.priceDelta === "number") {
          deltas += opt.priceDelta;
        }
      }
    }
    return sum + (base + deltas) * line.quantity;
  }, 0);

  const formattedCartSubtotal = `${orderConfig?.currency || "USD"} ${cartSubtotal.toFixed(2)}`;

  return (
    <>
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
          className="sticky top-16 z-30 -mx-[var(--ps-space-1)] bg-[var(--ps-surface)]/95 py-[var(--ps-space-2)] backdrop-blur md:top-20"
          role="group"
          aria-label={labels.categories}
          id={chipsId}
        >
          <div className="flex gap-[var(--ps-space-2)] overflow-x-auto px-[var(--ps-space-1)] pb-[var(--ps-space-1)]">
            {[BROWSE_ALL_GROUP, ...categoryGroups.map((group) => group.id)].map((groupId) => {
              const active = activeGroup === groupId;
              const title =
                groupId === BROWSE_ALL_GROUP
                  ? labels.all
                  : groups.find((group) => group.id === groupId)?.title ?? groupId;
              return (
                <button
                  key={groupId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveGroup(groupId)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-[var(--ps-space-4)] py-[var(--ps-space-2)] text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] ${
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
      ) : (
        <div className="space-y-[var(--ps-space-8)]">
          {pagedVisible.map((group) => (
            <section
              key={group.id}
              {...(categoryTiles && group.id === "uncategorized" ? {} : { "aria-labelledby": `group-title-${group.id}` })}
              className="space-y-[var(--ps-space-3)]"
            >
              {categoryTiles && group.id === "uncategorized" ? null : (
                <h3 id={`group-title-${group.id}`} className="text-base font-bold text-[var(--ps-text)]">
                  {group.title}
                </h3>
              )}
              <div className="grid gap-[var(--ps-space-3)] sm:grid-cols-2 lg:grid-cols-3">
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
                        <img src={item.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
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
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`${item.name}`}
                    onClick={(event) => openSheet(item.id, event.currentTarget)}
                    className={`group flex min-h-11 items-start gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-3)] text-left shadow-xs transition hover:border-[var(--ps-border)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] ${
                      item.isSoldOut ? "opacity-60" : ""
                    }`}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-[var(--ps-space-2)]">
                        <span className="block truncate text-sm font-semibold text-[var(--ps-text)] group-hover:text-[var(--ps-accent-hover)]">
                          {item.name}
                        </span>
                        {item.isSoldOut && labels.soldOut ? (
                          <span className="shrink-0 rounded bg-[var(--ps-neutral)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--ps-muted)] border border-[var(--ps-border)]">
                            {labels.soldOut}
                          </span>
                        ) : null}
                      </span>
                      {item.description ? (
                        <span className="mt-[var(--ps-space-1)] line-clamp-2 block text-xs text-[var(--ps-muted)]">
                          {item.description}
                        </span>
                      ) : null}
                      <span className="mt-[var(--ps-space-1)] flex items-baseline gap-[var(--ps-space-2)]">
                        {item.priceLabel ? (
                          <span
                            className={
                              item.originalPriceLabel
                                ? "text-xs font-bold text-[var(--ps-accent-hover)]"
                                : "text-xs font-bold text-[var(--ps-text)]"
                            }
                          >
                            {item.priceLabel}
                          </span>
                        ) : null}
                        {item.originalPriceLabel ? (
                          <span className="text-xs font-normal text-[var(--ps-muted)] line-through">
                            {item.originalPriceLabel}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
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
          itemId={selected.id}
          title={selected.name}
          image={selected.image ?? null}
          description={selected.description ?? null}
          priceLabel={selected.priceLabel}
          originalPriceLabel={selected.originalPriceLabel}
          numericPrice={selected.numericPrice}
          isSoldOut={selected.isSoldOut}
          optionGroups={selected.optionGroups}
          tags={selected.tags}
          detailRows={selected.detailRows}
          action={selected.action}
          closeLabel={labels.close}
          labels={labels}
          orderConfig={orderConfig}
          onAddToOrder={handleAddToOrder}
          onClose={closeSheet}
        />
      ) : null}

      {/* Floating cart bar */}
      {orderConfig?.enabled && totalCartCount > 0 && !isCartOpen && !orderSuccess ? (
        <div className="fixed bottom-4 inset-x-4 z-40 max-w-lg mx-auto">
          <div className="flex items-center justify-between gap-[var(--ps-space-3)] rounded-2xl bg-[var(--ps-text)] p-[var(--ps-space-4)] text-white shadow-xl">
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
              className="ps-button ps-button-primary rounded-xl text-xs font-bold transition"
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
          onClose={() => setOrderSuccess(null)}
        />
      ) : null}

      {/* Bottom padding to prevent floating cart bar from covering last content */}
      {orderConfig?.enabled && totalCartCount > 0 && !isCartOpen && !orderSuccess ? (
        <div className="h-24" aria-hidden="true" />
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
  originalPriceLabel,
  numericPrice,
  isSoldOut,
  optionGroups,
  tags,
  detailRows,
  action,
  closeLabel,
  labels,
  orderConfig,
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
  isSoldOut?: boolean;
  optionGroups?: BrowseOptionGroup[];
  tags: string[];
  detailRows: Array<{ label: string; value: string }>;
  action?: { label: string; href: string };
  closeLabel: string;
  labels: StorefrontBrowseLabels;
  orderConfig?: StorefrontOrderConfig;
  onAddToOrder?: (itemId: string, selectedOptionIds: string[], quantity: number) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});

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
  const handleOptionToggle = (groupId: string, optionId: string, max: number) => {
    setSelectedOptions((prev) => {
      const current = prev[groupId] || [];
      if (max === 1) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length < max) {
        return { ...prev, [groupId]: [...current, optionId] };
      }
      return prev;
    });
  };

  // Check required groups
  const isRequiredSatisfied = (optionGroups || []).every((group) => {
    if (!group.required) return true;
    const selected = selectedOptions[group.id] || [];
    return selected.length >= (group.min || 1);
  });

  // Calculate live item line price
  const basePrice = typeof numericPrice === "number" ? numericPrice : 0;
  let optionsDelta = 0;
  for (const group of optionGroups || []) {
    const selected = selectedOptions[group.id] || [];
    for (const opt of group.options) {
      if (selected.includes(opt.id) && typeof opt.priceDelta === "number") {
        optionsDelta += opt.priceDelta;
      }
    }
  }
  const totalUnitPrice = basePrice + optionsDelta;
  const lineTotalFormatted = `${orderConfig?.currency || "USD"} ${(totalUnitPrice * quantity).toFixed(2)}`;

  const canAddToOrder = !isSoldOut && isRequiredSatisfied && !orderConfig?.blocked;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-[var(--ps-space-6)]"
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
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--ps-surface)] shadow-xl outline-none sm:rounded-2xl"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="aspect-[16/9] w-full rounded-t-2xl object-cover" />
        ) : null}
        <div className="space-y-[var(--ps-space-3)] p-[var(--ps-space-6)] sm:p-[var(--ps-space-6)]">
          <div className="flex items-start justify-between gap-[var(--ps-space-3)]">
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
              <div className="mt-[var(--ps-space-1)] flex flex-wrap items-baseline gap-[var(--ps-space-2)]">
                {priceLabel ? (
                  <p
                    className={
                      originalPriceLabel
                        ? "text-base font-bold text-[var(--ps-accent-hover)]"
                        : "text-base font-bold text-[var(--ps-text)]"
                    }
                  >
                    {priceLabel}
                  </p>
                ) : null}
                {originalPriceLabel ? (
                  <span className="text-sm font-normal text-[var(--ps-muted)] line-through">
                    {originalPriceLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 rounded-lg border border-[var(--ps-border)] px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-xs font-semibold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
            >
              {closeLabel}
            </button>
          </div>
          {description ? <p className="text-sm leading-6 text-[var(--ps-muted)]">{description}</p> : null}
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-[var(--ps-space-2)]">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-emerald-50 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium capitalize text-emerald-700"
                >
                  {tag.replace("_", " ")}
                </span>
              ))}
            </div>
          ) : null}

          {/* Option groups */}
          {optionGroups && optionGroups.length > 0 ? (
            <div className="space-y-[var(--ps-space-3)] pt-[var(--ps-space-1)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ps-muted)]">
                {labels.options || "Options"}
              </h3>
              <div className="space-y-[var(--ps-space-3)]">
                {optionGroups.map((group) => {
                  const currentSelected = selectedOptions[group.id] || [];
                  const isSingle = group.max === 1;

                  return (
                    <div key={group.id} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)]/70 p-[var(--ps-space-3)]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--ps-text)]">{group.name}</span>
                        <span
                          className={`rounded-full px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium ${
                            group.required
                              ? "bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]"
                              : "bg-[var(--ps-neutral)]/80 text-[var(--ps-muted)]"
                          }`}
                        >
                          {group.required ? labels.required || "Required" : labels.optional || "Optional"}
                        </span>
                      </div>
                      <div className="mt-[var(--ps-space-3)] space-y-[var(--ps-space-2)]">
                        {group.options.map((opt) => {
                          const isChecked = currentSelected.includes(opt.id);

                          return (
                            <label
                              key={opt.id}
                              className={`flex items-center justify-between text-xs p-[var(--ps-space-2)] rounded-lg border transition cursor-pointer ${
                                isChecked
                                  ? "border-[var(--ps-accent-hover)] bg-[var(--ps-accent-light)]/50 text-[var(--ps-text)]"
                                  : "border-[var(--ps-border)] bg-[var(--ps-surface)] text-[var(--ps-muted)] hover:border-[var(--ps-border)]"
                              }`}
                            >
                              <div className="flex items-center gap-[var(--ps-space-2)]">
                                <input
                                  type={isSingle ? "radio" : "checkbox"}
                                  name={`group-${group.id}`}
                                  checked={isChecked}
                                  onChange={() => handleOptionToggle(group.id, opt.id, group.max)}
                                  className="text-[var(--ps-accent-hover)] focus:ring-[var(--ps-accent-hover)]"
                                />
                                <span>{opt.name}</span>
                              </div>
                              {opt.priceDeltaLabel ? (
                                <span className="font-medium text-[var(--ps-muted)]">{opt.priceDeltaLabel}</span>
                              ) : null}
                            </label>
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
            <dl className="divide-y divide-[var(--ps-border)] rounded-xl border border-[var(--ps-border)]">
              {detailRows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-[var(--ps-space-3)] px-[var(--ps-space-3)] py-[var(--ps-space-2)]">
                  <dt className="text-xs font-semibold text-[var(--ps-muted)]">{row.label}</dt>
                  <dd className="text-right text-xs font-medium text-[var(--ps-text)]">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* Ordering controls: quantity + Add to order */}
          {orderConfig?.enabled ? (
            <div className="pt-[var(--ps-space-2)] border-t border-[var(--ps-border)] space-y-[var(--ps-space-3)]">
              {!isSoldOut ? (
                <div className="flex items-center justify-between gap-[var(--ps-space-3)]">
                  <span className="text-xs font-semibold text-[var(--ps-muted)]">Quantity</span>
                  <div className="flex items-center rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)] p-[var(--ps-space-1)]">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="h-7 w-7 rounded-lg bg-[var(--ps-surface)] flex items-center justify-center text-[var(--ps-muted)] shadow-xs hover:bg-[var(--ps-neutral)] disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-[var(--ps-text)]">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                      disabled={quantity >= 99}
                      className="h-7 w-7 rounded-lg bg-[var(--ps-surface)] flex items-center justify-center text-[var(--ps-muted)] shadow-xs hover:bg-[var(--ps-neutral)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!canAddToOrder}
                onClick={() => {
                  if (canAddToOrder && onAddToOrder) {
                    const allSelected = Object.values(selectedOptions).flat();
                    onAddToOrder(itemId, allSelected, quantity);
                  }
                }}
                className="ps-button ps-button-primary w-full text-center text-sm font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isSoldOut
                  ? labels.soldOut || "Sold out"
                  : `${labels.addToOrder || "Add to order"} • ${lineTotalFormatted}`}
              </button>
            </div>
          ) : action ? (
            <a
              href={action.href}
              className="block rounded-xl bg-[var(--ps-text)] px-[var(--ps-space-4)] py-[var(--ps-space-3)] text-center text-sm font-semibold text-white hover:bg-[var(--ps-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
            >
              {action.label}
            </a>
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
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onOrderSuccess,
}: {
  cart: CartItem[];
  orderConfig: StorefrontOrderConfig;
  allItems: BrowseItem[];
  labels: StorefrontBrowseLabels;
  accentColor?: string;
  onClose: () => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
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
  const subtotal = cart.reduce((sum, line) => {
    const it = itemsMap.get(line.itemId);
    if (!it) return sum;
    const base = typeof it.numericPrice === "number" ? it.numericPrice : 0;
    let deltas = 0;
    const optSet = new Set(line.selectedOptionIds);
    for (const group of it.optionGroups || []) {
      for (const opt of group.options) {
        if (optSet.has(opt.id) && typeof opt.priceDelta === "number") {
          deltas += opt.priceDelta;
        }
      }
    }
    return sum + (base + deltas) * line.quantity;
  }, 0);

  // Delivery fee preview (client-side only; server recomputes authoritatively on submit)
  const rawDeliveryFee = orderConfig.deliveryFee ?? 0;
  const freeAbove = orderConfig.freeDeliveryAbove ?? null;
  const displayDeliveryFee =
    fulfilment === "delivery"
      ? freeAbove !== null && subtotal >= freeAbove
        ? 0
        : rawDeliveryFee
      : 0;
  const grandTotal = subtotal + displayDeliveryFee;

  const formattedSubtotal = `${orderConfig.currency} ${subtotal.toFixed(2)}`;
  const formattedDeliveryFee =
    displayDeliveryFee === 0
      ? orderConfig.currency + " 0.00"
      : `${orderConfig.currency} ${displayDeliveryFee.toFixed(2)}`;
  const formattedTotal = `${orderConfig.currency} ${grandTotal.toFixed(2)}`;

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

    const payloadItems = cart.map((c) => ({
      itemId: c.itemId,
      selectedOptionIds: c.selectedOptionIds,
      quantity: c.quantity,
    }));
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
        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-[var(--ps-space-6)]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          className="max-h-[90dvh] w-full max-w-lg flex flex-col rounded-t-2xl bg-[var(--ps-surface)] shadow-2xl outline-none sm:rounded-2xl"
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
              <div className="rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-3)] text-xs font-medium text-red-700">
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-[var(--ps-space-6)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-lg flex flex-col rounded-t-2xl bg-[var(--ps-surface)] shadow-2xl outline-none sm:rounded-2xl"
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-[var(--ps-space-3)] text-xs text-amber-900">
              <div className="font-bold flex items-center gap-[var(--ps-space-2)]">
                <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Notice: Restaurant Closed</span>
              </div>
              <p className="mt-[var(--ps-space-1)] text-amber-800">
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

              const base = typeof it.numericPrice === "number" ? it.numericPrice : 0;
              let deltas = 0;
              const chosenOptionNames: string[] = [];
              const optSet = new Set(line.selectedOptionIds);
              for (const group of it.optionGroups || []) {
                for (const opt of group.options) {
                  if (optSet.has(opt.id)) {
                    chosenOptionNames.push(opt.name);
                    if (typeof opt.priceDelta === "number") deltas += opt.priceDelta;
                  }
                }
              }
              const itemTotal = (base + deltas) * line.quantity;

              return (
                <div key={`${line.itemId}-${index}`} className="flex items-start justify-between gap-[var(--ps-space-3)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)]/60 p-[var(--ps-space-3)]">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--ps-text)]">{it.name}</p>
                    {chosenOptionNames.length > 0 ? (
                      <p className="text-xs text-[var(--ps-muted)] mt-[var(--ps-space-1)]">{chosenOptionNames.join(", ")}</p>
                    ) : null}
                    <p className="text-xs font-semibold text-[var(--ps-accent-hover)] mt-[var(--ps-space-1)]">
                      {orderConfig.currency} {itemTotal.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-[var(--ps-space-2)]">
                    <div className="flex items-center rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-1)] shadow-xs">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, line.quantity - 1)}
                        className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-[var(--ps-text)]">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, line.quantity + 1)}
                        className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="text-[var(--ps-muted)] hover:text-red-500 p-[var(--ps-space-1)]"
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
              <div className="rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-3)] text-xs font-medium text-red-700">
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
                      <span className="text-green-600">{labels.freeDelivery || "Free"}</span>
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-[var(--ps-space-4)]">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--ps-surface)] p-[var(--ps-space-6)] text-center shadow-2xl space-y-[var(--ps-space-4)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
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
                      <span className="text-green-600">{labels.freeDelivery || "Free"}</span>
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
          className="w-full rounded-xl bg-[var(--ps-text)] py-[var(--ps-space-3)] text-xs font-bold text-white hover:bg-[var(--ps-muted)] transition"
        >
          {labels.backToMenu || "Back to menu"}
        </button>
      </div>
    </div>
  );
}
