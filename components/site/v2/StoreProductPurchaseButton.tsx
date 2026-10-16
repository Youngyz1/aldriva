"use client";

import { useState, type FormEvent } from "react";

export interface StoreProductPurchaseLabels {
  quantity: string;
  buyerName: string;
  buyerEmail: string;
  buyNow: string;
  processing: string;
  checkoutError: string;
}

export function StoreProductPurchaseButton({
  productId,
  maxQuantity,
  labels,
}: {
  productId: string;
  maxQuantity: number;
  labels: StoreProductPurchaseLabels;
}) {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity,
          buyerName: String(form.get("buyerName") ?? "").trim(),
          buyerEmail: String(form.get("buyerEmail") ?? "").trim(),
        }),
      });
      const result = await response.json() as { url?: string };
      if (!response.ok || !result.url) throw new Error("checkout");
      window.location.assign(result.url);
    } catch {
      setError(labels.checkoutError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium text-[var(--ps-text)]">
        <span>{labels.quantity}</span>
        <input
          type="number"
          name="quantity"
          min={1}
          max={maxQuantity}
          value={quantity}
          onChange={(event) => setQuantity(Math.min(maxQuantity, Math.max(1, Number(event.target.value) || 1)))}
          className="w-full rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-[var(--ps-text)]">
        <span>{labels.buyerName}</span>
        <input name="buyerName" autoComplete="name" className="w-full rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] px-3 py-2" />
      </label>
      <label className="block space-y-1 text-sm font-medium text-[var(--ps-text)]">
        <span>{labels.buyerEmail}</span>
        <input name="buyerEmail" type="email" autoComplete="email" required className="w-full rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] px-3 py-2" />
      </label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy} className="ps-button ps-button-primary min-h-11 w-full disabled:opacity-60">
        {busy ? labels.processing : labels.buyNow}
      </button>
    </form>
  );
}
