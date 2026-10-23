"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCircleCheck as CheckCircle2, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { formatMoney } from "@/lib/money";

interface StoreOrderConfirmationLabels {
  pendingTitle: string;
  pendingBody: string;
  confirmedTitle: string;
  confirmedBody: string;
  failedTitle: string;
  failedBody: string;
  reference: string;
  backToShop: string;
  locale: string;
}

/**
 * StoreOrderConfirmationView — site-local order confirmation. Polls the
 * existing buyer-proofed `/api/products/order-lookup` (session_id proof is
 * verified live against Stripe) so no new lookup endpoint or parallel order
 * system is introduced. The server page gates tenancy before rendering this.
 */
export function StoreOrderConfirmationView({
  orderId,
  sessionId,
  cartSessionId = null,
  shopHref,
  labels,
}: {
  orderId: string | null;
  sessionId: string | null;
  /** Multi-item cart sessions poll by Stripe session id instead of order id. */
  cartSessionId?: string | null;
  shopHref: string;
  labels: StoreOrderConfirmationLabels;
}) {
  const [status, setStatus] = useState<"loading" | "pending" | "paid" | "failed">("loading");
  const [order, setOrder] = useState<{
    productName: string | null;
    quantity: number | null;
    totalAmount: number | null;
    currency: string | null;
  }>({ productName: null, quantity: null, totalAmount: null, currency: null });
  const [cartItems, setCartItems] = useState<Array<{
    productName: string;
    quantity: number;
    totalAmount: number;
    currency: string;
  }> | null>(null);

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;

    async function pollLookup() {
      attempts++;
      try {
        const params = cartSessionId
          ? new URLSearchParams({ cartSession: cartSessionId })
          : new URLSearchParams({ orderId: orderId as string });
        if (!cartSessionId && sessionId) params.set("session_id", sessionId);
        const res = await fetch(`/api/products/order-lookup?${params.toString()}`);
        if (!res.ok) {
          if (attempts > 15 && isMounted) {
            setStatus("failed");
            if (intervalId) clearInterval(intervalId);
          }
          return;
        }
        const data = await res.json();
        if (!isMounted) return;
        if (Array.isArray(data.items)) {
          const entries = data.items as Array<{
            productName?: string;
            quantity?: number;
            totalAmount?: number;
            currency?: string;
          }>;
          setCartItems(
            entries.map((entry) => ({
              productName: entry.productName ?? "",
              quantity: entry.quantity ?? 0,
              totalAmount: entry.totalAmount ?? 0,
              currency: entry.currency ?? "",
            }))
          );
          setOrder({
            productName: null,
            quantity: entries.length,
            totalAmount: entries.reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0),
            currency: data.currency ?? null,
          });
        } else {
          setOrder({
            productName: data.productName ?? null,
            quantity: data.quantity ?? null,
            totalAmount: data.totalAmount ?? null,
            currency: data.currency ?? null,
          });
        }
        if (data.status === "paid") {
          setStatus("paid");
          if (intervalId) clearInterval(intervalId);
        } else if (data.status === "cancelled" || data.status === "refunded") {
          setStatus("failed");
          if (intervalId) clearInterval(intervalId);
        } else {
          setStatus("pending");
        }
      } catch {
        // Keep polling; network blips must not fail the confirmation.
      }
    }

    intervalId = setInterval(pollLookup, 2000);
    pollLookup();

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [orderId, sessionId, cartSessionId]);

  const formattedTotal =
    order.totalAmount !== null && order.currency
      ? formatMoney(Number(order.totalAmount), String(order.currency), labels.locale)
      : null;

  if (status === "paid") {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-8 text-center shadow-xs">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[var(--ps-success)]" aria-hidden="true" />
        <h1 className="text-xl font-bold text-[var(--ps-text)]">{labels.confirmedTitle}</h1>
        <p className="mt-2 text-sm text-[var(--ps-muted)]">{labels.confirmedBody}</p>
        <dl className="mt-6 space-y-2 rounded-xl bg-[var(--ps-neutral)] p-4 text-left text-sm">
          {orderId ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--ps-muted)]">{labels.reference}</dt>
              <dd className="font-semibold tabular-nums text-[var(--ps-text)]">{orderId}</dd>
            </div>
          ) : null}
          {cartItems && cartItems.length > 0
            ? cartItems.map((entry, index) => (
                <div key={`${entry.productName}-${index}`} className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--ps-muted)]">{entry.productName}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--ps-text)]">× {entry.quantity}</dd>
                </div>
              ))
            : order.productName ? (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--ps-muted)]">{order.productName}</dt>
                <dd className="font-semibold tabular-nums text-[var(--ps-text)]">
                  {order.quantity !== null ? `× ${order.quantity}` : null}
                </dd>
              </div>
            ) : null}
        </dl>
        {formattedTotal ? (
          <p className="mt-4 text-xl font-bold tabular-nums text-[var(--ps-text)]">{formattedTotal}</p>
        ) : null}
        <Link
          href={shopHref}
          className="ps-button ps-button-primary mt-6 inline-flex min-h-11 w-full items-center justify-center"
        >
          {labels.backToShop}
        </Link>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-8 text-center shadow-xs">
        <h1 className="text-xl font-bold text-[var(--ps-text)]">{labels.failedTitle}</h1>
        <p className="mt-2 text-sm text-[var(--ps-muted)]">{labels.failedBody}</p>
        {orderId ? (
          <p className="mt-4 text-xs tabular-nums text-[var(--ps-muted)]">
            {labels.reference}: {orderId}
          </p>
        ) : null}
        <Link
          href={shopHref}
          className="ps-button ps-button-secondary mt-6 inline-flex min-h-11 w-full items-center justify-center"
        >
          {labels.backToShop}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-8 text-center shadow-xs">
      <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-[var(--ps-accent-hover)]" aria-hidden="true" />
      <h1 className="text-xl font-bold text-[var(--ps-text)]">{labels.pendingTitle}</h1>
      <p className="mt-2 text-sm text-[var(--ps-muted)]">{labels.pendingBody}</p>
    </div>
  );
}
