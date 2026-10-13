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
  orderConfig?: StorefrontOrderConfig;
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
  children,
}: StorefrontBrowseProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(BROWSE_ALL_GROUP);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string;
    scheduledFor?: string | null;
  } | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const searchId = useId();
  const chipsId = useId();

  useEffect(() => {
    setMounted(true);
    if (orderConfig?.enabled && orderConfig.slug) {
      setCart(loadCart(orderConfig.slug));
    }
  }, [orderConfig?.enabled, orderConfig?.slug]);

  // Before hydration (and without JS): server static markup only.
  if (!mounted) return <>{children}</>;

  if (groups.length === 0) return <>{children}</>;

  const visible = filterBrowseGroups(groups, query, activeGroup);
  const engaged = query.trim() !== "" || activeGroup !== BROWSE_ALL_GROUP;
  const allItems = groups.flatMap((group) => group.items);
  const selected = selectedId
    ? allItems.find((item) => item.id === selectedId) ?? null
    : null;

  const reset = () => {
    setQuery("");
    setActiveGroup(BROWSE_ALL_GROUP);
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
      {showGroups && groups.length > 1 ? (
        <div
          className="sticky top-16 z-30 -mx-1 bg-white/95 py-2 backdrop-blur md:top-20"
          role="group"
          aria-label={labels.categories}
          id={chipsId}
        >
          <div className="flex gap-2 overflow-x-auto px-1 pb-1">
            {[BROWSE_ALL_GROUP, ...groups.map((group) => group.id)].map((groupId) => {
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
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
                    active
                      ? "border-orange-600 bg-orange-600 text-white shadow-xs"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  {title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="my-4">
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
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={labels.clearFilters}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:text-zinc-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">
          <p>{labels.noResults}</p>
          {engaged ? (
            <button
              type="button"
              onClick={reset}
              className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 underline"
            >
              {labels.clearFilters}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-8">
          {visible.map((group) => (
            <section key={group.id} aria-labelledby={`group-title-${group.id}`} className="space-y-3">
              <h3 id={`group-title-${group.id}`} className="text-base font-bold text-zinc-900">
                {group.title}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`${item.name}`}
                    onClick={(event) => openSheet(item.id, event.currentTarget)}
                    className={`group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-xs transition hover:border-zinc-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
                      item.isSoldOut ? "opacity-60" : ""
                    }`}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate text-sm font-semibold text-zinc-900 group-hover:text-orange-600">
                          {item.name}
                        </span>
                        {item.isSoldOut && labels.soldOut ? (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-bold text-zinc-600 border border-zinc-200">
                            {labels.soldOut}
                          </span>
                        ) : null}
                      </span>
                      {item.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-500">
                          {item.description}
                        </span>
                      ) : null}
                      <span className="mt-1 flex items-baseline gap-1.5">
                        {item.priceLabel ? (
                          <span
                            className={
                              item.originalPriceLabel
                                ? "text-xs font-bold text-orange-700"
                                : "text-xs font-bold text-zinc-900"
                            }
                          >
                            {item.priceLabel}
                          </span>
                        ) : null}
                        {item.originalPriceLabel ? (
                          <span className="text-[11px] font-normal text-zinc-400 line-through">
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
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-900 p-4 text-white shadow-xl">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold">
                {totalCartCount}
              </span>
              <div className="text-sm font-semibold">
                {labels.yourOrder || "Your order"} • {formattedCartSubtotal}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 transition"
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
      {orderSuccess ? (
        <OrderConfirmationModal
          orderNumber={orderSuccess.orderNumber}
          scheduledFor={orderSuccess.scheduledFor}
          labels={labels}
          onClose={() => setOrderSuccess(null)}
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
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
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="aspect-[16/9] w-full rounded-t-2xl object-cover" />
        ) : null}
        <div className="space-y-3 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-lg font-bold text-zinc-900">
                  {title}
                </h2>
                {isSoldOut && labels.soldOut ? (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600 border border-zinc-200">
                    {labels.soldOut}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                {priceLabel ? (
                  <p
                    className={
                      originalPriceLabel
                        ? "text-base font-bold text-orange-700"
                        : "text-base font-bold text-zinc-900"
                    }
                  >
                    {priceLabel}
                  </p>
                ) : null}
                {originalPriceLabel ? (
                  <span className="text-sm font-normal text-zinc-400 line-through">
                    {originalPriceLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              {closeLabel}
            </button>
          </div>
          {description ? <p className="text-sm leading-6 text-zinc-600">{description}</p> : null}
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium capitalize text-emerald-700"
                >
                  {tag.replace("_", " ")}
                </span>
              ))}
            </div>
          ) : null}

          {/* Option groups */}
          {optionGroups && optionGroups.length > 0 ? (
            <div className="space-y-2.5 pt-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                {labels.options || "Options"}
              </h3>
              <div className="space-y-3">
                {optionGroups.map((group) => {
                  const currentSelected = selectedOptions[group.id] || [];
                  const isSingle = group.max === 1;

                  return (
                    <div key={group.id} className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900">{group.name}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            group.required
                              ? "bg-orange-100 text-orange-800"
                              : "bg-zinc-200/80 text-zinc-600"
                          }`}
                        >
                          {group.required ? labels.required || "Required" : labels.optional || "Optional"}
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-2">
                        {group.options.map((opt) => {
                          const isChecked = currentSelected.includes(opt.id);

                          return (
                            <label
                              key={opt.id}
                              className={`flex items-center justify-between text-xs p-2 rounded-lg border transition cursor-pointer ${
                                isChecked
                                  ? "border-orange-500 bg-orange-50/50 text-zinc-900"
                                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type={isSingle ? "radio" : "checkbox"}
                                  name={`group-${group.id}`}
                                  checked={isChecked}
                                  onChange={() => handleOptionToggle(group.id, opt.id, group.max)}
                                  className="text-orange-600 focus:ring-orange-500"
                                />
                                <span>{opt.name}</span>
                              </div>
                              {opt.priceDeltaLabel ? (
                                <span className="font-medium text-zinc-500">{opt.priceDeltaLabel}</span>
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
            <dl className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
              {detailRows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-3 px-3 py-2">
                  <dt className="text-xs font-semibold text-zinc-500">{row.label}</dt>
                  <dd className="text-right text-xs font-medium text-zinc-800">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* Ordering controls: quantity + Add to order */}
          {orderConfig?.enabled ? (
            <div className="pt-2 border-t border-zinc-100 space-y-3">
              {!isSoldOut ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-zinc-700">Quantity</span>
                  <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="h-7 w-7 rounded-lg bg-white flex items-center justify-center text-zinc-700 shadow-xs hover:bg-zinc-100 disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-zinc-900">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                      disabled={quantity >= 99}
                      className="h-7 w-7 rounded-lg bg-white flex items-center justify-center text-zinc-700 shadow-xs hover:bg-zinc-100 disabled:opacity-40"
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
                className="w-full rounded-xl bg-orange-600 px-4 py-3 text-center text-sm font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isSoldOut
                  ? labels.soldOut || "Sold out"
                  : `${labels.addToOrder || "Add to order"} • ${lineTotalFormatted}`}
              </button>
            </div>
          ) : action ? (
            <a
              href={action.href}
              className="block rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
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
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onOrderSuccess,
}: {
  cart: CartItem[];
  orderConfig: StorefrontOrderConfig;
  allItems: BrowseItem[];
  labels: StorefrontBrowseLabels;
  onClose: () => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onOrderSuccess: (result: { orderNumber: string; scheduledFor?: string | null }) => void;
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
  const [onlineScheduledFor, setOnlineScheduledFor] = useState<string | null>(null);
  const [isStartingPayment, setIsStartingPayment] = useState(false);

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

  const formattedSubtotal = `${orderConfig.currency} ${subtotal.toFixed(2)}`;

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
          }),
        });
        const intentData = await intentRes.json().catch(() => ({}));
        if (!intentRes.ok || !intentData.clientSecret) {
          setErrorMessage(intentData.error || "Could not start the card payment. Please try again.");
          setIsStartingPayment(false);
          return;
        }
        setOnlineOrderNumber(intentData.orderNumber);
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
        scheduledFor: res.scheduledFor,
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
        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          className="max-h-[90dvh] w-full max-w-lg flex flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 sm:p-5">
            <h2 className="text-base font-bold text-zinc-900">{labels.payOnline || "Pay online"}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between text-sm font-bold text-zinc-900">
              <span>{labels.total || "Total"}</span>
              <span className="text-orange-700">{formattedSubtotal}</span>
            </div>
            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {errorMessage}
              </div>
            ) : null}
            <StripeProvider clientSecret={onlineSecret} accentColor="#c2410c">
              <PaymentForm
                onSuccess={() => {
                  onOrderSuccess({
                    orderNumber: onlineOrderNumber,
                    scheduledFor: onlineScheduledFor,
                  });
                }}
                onBack={() => {
                  setOnlineSecret(null);
                  setOnlineOrderNumber(null);
                }}
                submitLabel={`${labels.payOnline || "Pay online"} • ${formattedSubtotal}`}
                accentColor="#c2410c"
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-lg flex flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 p-4 sm:p-5">
          <h2 className="text-base font-bold text-zinc-900">{labels.yourOrder || "Your order"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Closed Restaurant Notice */}
          {orderConfig.isClosed ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-bold flex items-center gap-1.5">
                <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Notice: Restaurant Closed</span>
              </div>
              <p className="mt-1 text-amber-800">
                {orderConfig.scheduledFor
                  ? `Your order will be accepted and prepared for reopening on ${new Date(orderConfig.scheduledFor).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
                  : labels.scheduledNotice || "The restaurant is currently closed. Your order will be prepared for reopening."}
              </p>
            </div>
          ) : null}

          {/* Cart items list */}
          <div className="space-y-3">
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
                <div key={`${line.itemId}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-900">{it.name}</p>
                    {chosenOptionNames.length > 0 ? (
                      <p className="text-[11px] text-zinc-500 mt-0.5">{chosenOptionNames.join(", ")}</p>
                    ) : null}
                    <p className="text-xs font-semibold text-orange-700 mt-1">
                      {orderConfig.currency} {itemTotal.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, line.quantity - 1)}
                        className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-zinc-900">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, line.quantity + 1)}
                        className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="text-zinc-400 hover:text-red-500 p-1"
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

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Fulfilment selector */}
            {allowsDelivery && allowsPickup ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">{labels.fulfilment || "Fulfilment"}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfilment("pickup")}
                    className={`rounded-xl border py-2 px-3 text-xs font-bold transition ${
                      fulfilment === "pickup"
                        ? "border-orange-600 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {labels.pickup || "Pickup"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfilment("delivery")}
                    className={`rounded-xl border py-2 px-3 text-xs font-bold transition ${
                      fulfilment === "delivery"
                        ? "border-orange-600 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {labels.delivery || "Delivery"}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Delivery address */}
            {fulfilment === "delivery" ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">
                  {labels.deliveryAddress || "Delivery address"} *
                </label>
                <input
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={labels.deliveryAddressPlaceholder || "Street address, apartment, city"}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <p className="text-[11px] text-zinc-500">
                  {labels.deliveryFeeNotice || "Restaurant confirms delivery fee upon receipt"}
                </p>
              </div>
            ) : null}

            {/* Customer Details */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-700">
                {labels.customerDetails || "Your details"}
              </span>
              <div className="space-y-2">
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={`${labels.fullName || "Full name"} *`}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={`${labels.phone || "Phone number"} (e.g. +225 07000000) *`}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder={labels.email || "Email (optional)"}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <textarea
                  rows={2}
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder={labels.orderNotePlaceholder || "Special requests, allergies…"}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Payment method (choice only when online payment is available) */}
            {canPayOnline ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">{labels.paymentMethod || "Payment method"}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod("fulfilment")}
                    className={`rounded-xl border py-2 px-3 text-xs font-bold transition ${
                      payMethod === "fulfilment"
                        ? "border-orange-600 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {labels.paymentOnFulfilment || "Payment upon pickup/delivery"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod("online")}
                    className={`rounded-xl border py-2 px-3 text-xs font-bold transition ${
                      payMethod === "online"
                        ? "border-orange-600 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {labels.payOnline || "Pay online"}
                  </button>
                </div>
                {payMethod === "online" ? (
                  <p className="text-[11px] text-zinc-500">
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
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {/* Total and Submit */}
            <div className="border-t border-zinc-100 pt-3 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                <span>{labels.subtotal || "Subtotal"}</span>
                <span>{formattedSubtotal}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold text-zinc-900">
                <span>{labels.total || "Total"}</span>
                <span className="text-orange-700">{formattedSubtotal}</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                {payMethod === "online"
                  ? labels.onlinePaymentNotice || "You will pay by card now."
                  : labels.paymentOnFulfilment || "Payment upon pickup/delivery"}
              </p>

              <button
                type="submit"
                disabled={isSubmitting || isStartingPayment || cart.length === 0}
                className="w-full rounded-xl bg-orange-600 py-3 text-center text-sm font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-40 transition"
              >
                {isSubmitting || isStartingPayment
                  ? payMethod === "online"
                    ? labels.payingOnline || "Preparing secure payment…"
                    : labels.placingOrder || "Placing order…"
                  : payMethod === "online"
                    ? `${labels.payOnline || "Pay online"} • ${formattedSubtotal}`
                    : `${labels.placeOrder || "Place order"} • ${formattedSubtotal}`}
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
  scheduledFor,
  labels,
  onClose,
}: {
  orderNumber: string;
  scheduledFor?: string | null;
  labels: StorefrontBrowseLabels;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-zinc-900">
            {labels.orderSuccessTitle || "Order requested!"}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {labels.orderSuccessSubtext || "We have received your order request."}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3.5 border border-zinc-100">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            {labels.orderNumber || "Order number"}
          </p>
          <p className="text-base font-extrabold text-orange-700 mt-0.5">{orderNumber}</p>
          {scheduledFor ? (
            <p className="mt-2 text-xs text-zinc-600">
              Scheduled for: {new Date(scheduledFor).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-bold text-white hover:bg-zinc-800 transition"
        >
          {labels.backToMenu || "Back to menu"}
        </button>
      </div>
    </div>
  );
}
