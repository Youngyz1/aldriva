"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconMinus as Minus, IconPlus as Plus, IconShoppingBag as ShoppingBag, IconTrash as Trash2, IconX as X } from "@tabler/icons-react";
import { formatMoney } from "@/lib/money";
import {
  useStoreCart,
  type StoreCartItem,
} from "@/lib/store-cart";

export interface StoreCartCatalogEntry {
  id: string;
  name: string;
  image: string | null;
  priceLabel: string | null;
  numericPrice?: number;
  currency?: string | null;
  isSoldOut?: boolean;
  href?: string | null;
}

export interface StoreCartLabels {
  title: string;
  empty: string;
  emptyBody: string;
  viewCart: string;
  added: string;
  addToCart: string;
  checkout: string;
  pay: string;
  back: string;
  continueShopping: string;
  subtotal: string;
  discount: string;
  total: string;
  remove: string;
  decrease: string;
  increase: string;
  promo: string;
  promoPlaceholder: string;
  buyerName: string;
  buyerEmail: string;
  changed: string;
  error: string;
  unavailable: string;
  locale: string;
}

interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  unitMajor: number;
  lineMajor: number;
}

interface ReviewSummary {
  currency: string;
  lines: PricedLine[];
  subtotalMajor: number;
  discountMajor: number;
  totalMajor: number;
  promoCode: string | null;
}

function money(major: number, currency: string, locale: string): string {
  return formatMoney(Number(major) || 0, currency || "USD", locale);
}

// First mounted widget per slug owns the floating button; extra widgets
// (e.g. two product blocks on one page) render their drawers only. Claims
// release on unmount so StrictMode remounts settle correctly.
const buttonClaims = new Map<string, number>();
let claimSeq = 0;

function claimButton(slug: string): number | null {
  if (buttonClaims.has(slug)) return null;
  claimSeq += 1;
  buttonClaims.set(slug, claimSeq);
  return claimSeq;
}

function releaseButton(slug: string, claim: number | null): void {
  if (claim !== null && buttonClaims.get(slug) === claim) {
    buttonClaims.delete(slug);
  }
}

/**
 * StoreCartWidget — floating cart button + drawer for Store pages. Mounted
 * via the Store-only opt-in on StorefrontBrowse and on the site-local
 * product detail page. Catalog summaries arrive as server-resolved props;
 * the drawer joins them with the local cart, so items removed from the
 * catalog render as unavailable rows instead of vanishing.
 */
export function StoreCartWidget({
  slug,
  siteCurrency,
  catalog,
  labels,
}: {
  slug: string;
  siteCurrency: string;
  catalog: StoreCartCatalogEntry[];
  labels: StoreCartLabels;
}) {
  const cart = useStoreCart(slug);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const claim = claimButton(slug);
    setShowButton(claim !== null);
    return () => releaseButton(slug, claim);
  }, [slug]);

  useEffect(() => {
    const onAdded = () => {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1600);
    };
    window.addEventListener("store-cart:added", onAdded);
    return () => {
      window.removeEventListener("store-cart:added", onAdded);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <>
      {showButton ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${labels.viewCart} (${cart.count})`}
          className={`ps-button ps-button-primary fixed bottom-5 right-5 z-40 flex h-12 min-w-12 items-center justify-center gap-2 rounded-full px-4 shadow-lg transition ${
            flash ? "scale-105" : ""
          }`}
        >
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-bold tabular-nums" aria-hidden="true">
            {cart.count}
          </span>
          <span className="sr-only" role="status">
            {flash ? labels.added : ""}
          </span>
        </button>
      ) : null}
      {open ? (
        <StoreCartDrawer
          slug={slug}
          siteCurrency={siteCurrency}
          catalog={catalog}
          labels={labels}
          onClose={() => setOpen(false)}
          onCheckoutDone={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function StoreCartDrawer({
  slug,
  siteCurrency,
  catalog,
  labels,
  onClose,
  onCheckoutDone,
}: {
  slug: string;
  siteCurrency: string;
  catalog: StoreCartCatalogEntry[];
  labels: StoreCartLabels;
  onClose: () => void;
  onCheckoutDone: () => void;
}) {
  const cart = useStoreCart(slug);
  const byId = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);
  const [step, setStep] = useState<"cart" | "review">("cart");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());

  const rows = cart.items.map((item) => ({ item, entry: byId.get(item.productId) ?? null }));

  const indicativeSubtotal = rows.reduce((sum, { item, entry }) => {
    if (!entry || typeof entry.numericPrice !== "number") return sum;
    return sum + entry.numericPrice * item.quantity;
  }, 0);

  const startReview = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/checkout/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug: slug,
          items: cart.items,
          buyerName: buyerName.trim() || undefined,
          buyerEmail: buyerEmail.trim() || undefined,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        issues?: Array<{ productId: string }>;
      } & Partial<ReviewSummary>;
      if (!response.ok || !result.lines) {
        setConflicts(new Set((result.issues ?? []).map((issue) => issue.productId)));
        setNotice(result.error || labels.error);
        // Drop items the server reports as gone so retry starts clean.
        for (const issue of result.issues ?? []) {
          if (!byId.get(issue.productId)) cart.remove(issue.productId);
        }
        return;
      }
      setConflicts(new Set());
      setReview(result as ReviewSummary);
      setStep("review");
    } catch {
      setNotice(labels.error);
    } finally {
      setBusy(false);
    }
  }, [slug, cart, buyerName, buyerEmail, promoCode, byId, labels]);

  const pay = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug: slug,
          items: cart.items,
          buyerName: buyerName.trim() || undefined,
          buyerEmail: buyerEmail.trim() || undefined,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
        issues?: Array<{ productId: string }>;
      };
      if (!response.ok || !result.url) {
        setConflicts(new Set((result.issues ?? []).map((issue) => issue.productId)));
        setNotice(result.error || labels.error);
        setStep("cart");
        setReview(null);
        return;
      }
      cart.clear();
      onCheckoutDone();
      window.location.assign(result.url);
    } catch {
      setNotice(labels.error);
    } finally {
      setBusy(false);
    }
  }, [slug, cart, buyerName, buyerEmail, promoCode, labels, onCheckoutDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--ps-border)] p-4">
          <h2 className="text-base font-bold text-[var(--ps-text)]">{labels.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.back}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {notice ? (
            <p role="alert" className="mb-3 rounded-xl border border-[var(--ps-error)] p-3 text-xs font-semibold text-[var(--ps-error)]">
              {notice}
            </p>
          ) : null}

          {cart.items.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-[var(--ps-muted)]" aria-hidden="true" />
              <p className="text-sm font-bold text-[var(--ps-text)]">{labels.empty}</p>
              <p className="mt-1 text-xs text-[var(--ps-muted)]">{labels.emptyBody}</p>
              <button
                type="button"
                onClick={onClose}
                className="ps-button ps-button-secondary mt-4 inline-flex min-h-11 items-center justify-center px-4"
              >
                {labels.continueShopping}
              </button>
            </div>
          ) : step === "cart" ? (
            <ul className="space-y-3">
              {rows.map(({ item, entry }) =>
                renderRow({
                  item,
                  entry,
                  conflict: conflicts.has(item.productId),
                  currency: siteCurrency,
                  labels,
                  onQuantity: (quantity) => cart.setQuantity(item.productId, quantity),
                  onRemove: () => cart.remove(item.productId),
                })
              )}
            </ul>
          ) : review ? (
            <div>
              <ul className="space-y-2 rounded-xl bg-[var(--ps-neutral)] p-3 text-sm">
                {review.lines.map((line) => (
                  <li key={line.productId} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[var(--ps-text)]">
                      {line.name} <span className="tabular-nums text-[var(--ps-muted)]">× {line.quantity}</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-[var(--ps-text)]">
                      {money(line.lineMajor, review.currency, labels.locale)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--ps-muted)]">{labels.subtotal}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--ps-text)]">
                    {money(review.subtotalMajor, review.currency, labels.locale)}
                  </dd>
                </div>
                {review.discountMajor > 0 ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-[var(--ps-muted)]">{labels.discount}</dt>
                    <dd className="font-semibold tabular-nums text-[var(--ps-success)]">
                      −{money(review.discountMajor, review.currency, labels.locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-[var(--ps-border)] pt-2">
                  <dt className="font-bold text-[var(--ps-text)]">{labels.total}</dt>
                  <dd className="text-base font-bold tabular-nums text-[var(--ps-text)]">
                    {money(review.totalMajor, review.currency, labels.locale)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {cart.items.length > 0 && step === "cart" ? (
            <div className="mt-4 space-y-3 border-t border-[var(--ps-border)] pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ps-muted)]">{labels.subtotal}</span>
                <span className="font-bold tabular-nums text-[var(--ps-text)]">
                  {money(indicativeSubtotal, siteCurrency, labels.locale)}
                </span>
              </div>
              <div>
                <label htmlFor="store-cart-name" className="mb-1 block text-xs font-semibold text-[var(--ps-muted)]">
                  {labels.buyerName}
                </label>
                <input
                  id="store-cart-name"
                  type="text"
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-3 py-2 text-sm text-[var(--ps-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
                />
              </div>
              <div>
                <label htmlFor="store-cart-email" className="mb-1 block text-xs font-semibold text-[var(--ps-muted)]">
                  {labels.buyerEmail}
                </label>
                <input
                  id="store-cart-email"
                  type="email"
                  required
                  value={buyerEmail}
                  onChange={(event) => setBuyerEmail(event.target.value)}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-3 py-2 text-sm text-[var(--ps-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
                />
              </div>
              <div>
                <label htmlFor="store-cart-promo" className="mb-1 block text-xs font-semibold text-[var(--ps-muted)]">
                  {labels.promo}
                </label>
                <input
                  id="store-cart-promo"
                  type="text"
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value)}
                  placeholder={labels.promoPlaceholder}
                  className="w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] px-3 py-2 text-sm uppercase text-[var(--ps-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--ps-border)] p-4">
          {cart.items.length > 0 && step === "cart" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startReview()}
              className="ps-button ps-button-primary inline-flex min-h-11 w-full items-center justify-center disabled:opacity-50"
            >
              {busy ? labels.checkout + "…" : labels.checkout}
            </button>
          ) : null}
          {step === "review" && review ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("cart");
                  setReview(null);
                }}
                className="ps-button ps-button-secondary inline-flex min-h-11 flex-1 items-center justify-center disabled:opacity-50"
              >
                {labels.back}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void pay()}
                className="ps-button ps-button-primary inline-flex min-h-11 flex-1 items-center justify-center disabled:opacity-50"
              >
                {busy ? labels.pay + "…" : labels.pay}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderRow({
  item,
  entry,
  conflict,
  currency,
  labels,
  onQuantity,
  onRemove,
}: {
  item: StoreCartItem;
  entry: StoreCartCatalogEntry | null;
  conflict: boolean;
  currency: string;
  labels: StoreCartLabels;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const unavailable = !entry || entry.isSoldOut;
  const lineTotal =
    entry && typeof entry.numericPrice === "number" ? entry.numericPrice * item.quantity : null;
  return (
    <li
      key={item.productId}
      className={`flex gap-3 rounded-xl border p-3 ${
        conflict || unavailable ? "border-[var(--ps-error)]" : "border-[var(--ps-border)]"
      }`}
    >
      {entry?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.image} alt="" aria-hidden="true" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[var(--ps-neutral)] text-[var(--ps-muted)]" aria-hidden="true">
          <ShoppingBag className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--ps-text)]">{entry?.name ?? "…"}</p>
        {entry?.priceLabel ? (
          <p className="text-xs tabular-nums text-[var(--ps-muted)]">{entry.priceLabel}</p>
        ) : null}
        {unavailable ? (
          <p role="alert" className="mt-1 text-xs font-semibold text-[var(--ps-error)]">
            {labels.unavailable}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="group" aria-label={entry?.name ?? ""}>
            <button
              type="button"
              onClick={() => onQuantity(item.quantity - 1)}
              disabled={unavailable}
              aria-label={`${labels.decrease} — ${entry?.name ?? ""}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ps-border)] text-[var(--ps-text)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantity(item.quantity + 1)}
              disabled={unavailable}
              aria-label={`${labels.increase} — ${entry?.name ?? ""}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ps-border)] text-[var(--ps-text)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {lineTotal !== null ? (
            <p className="text-sm font-bold tabular-nums text-[var(--ps-text)]">
              {money(lineTotal, currency, labels.locale)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            aria-label={labels.remove}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * StoreAddToCartButton — detail-page and card quick-add. Adds the item then
 * announces it; the floating widget (same slug) picks it up from the store.
 */
export function StoreAddToCartButton({
  slug,
  productId,
  quantity = 1,
  disabled = false,
  label,
}: {
  slug: string;
  productId: string;
  quantity?: number;
  disabled?: boolean;
  label: string;
}) {
  const cart = useStoreCart(slug);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        cart.add(productId, quantity);
        window.dispatchEvent(new CustomEvent("store-cart:added"));
      }}
      className="ps-button ps-button-secondary inline-flex min-h-11 items-center justify-center disabled:opacity-40"
    >
      {label}
    </button>
  );
}
