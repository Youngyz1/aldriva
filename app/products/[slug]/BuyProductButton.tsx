"use client";

import { useState } from "react";

type PaymentMethod = "card" | "crypto";

export default function BuyProductButton({
  productId,
  priceLabel,
  priceType,
  stockQuantity,
}: {
  productId: string;
  priceLabel: string;
  priceType: "one_time" | "subscription";
  stockQuantity: number | null;
}) {
  const [showModal, setShowModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxQuantity = stockQuantity !== null ? Math.min(stockQuantity, 100) : 100;

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = paymentMethod === "crypto" ? "/api/checkout/product-crypto" : "/api/checkout/product";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity, buyerEmail, buyerName }),
      });
      const data = await res.json();

      if (paymentMethod === "crypto") {
        if (!res.ok || !data.paymentUrl) {
          throw new Error(data.error || "Failed to start crypto payment.");
        }
        window.location.href = data.paymentUrl;
      } else {
        if (!res.ok || !data.url) {
          throw new Error(data.error || "Failed to create checkout session.");
        }
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex-1 md:flex-none inline-flex items-center justify-center rounded-xl bg-orange-600 px-6 py-2.5 text-center text-sm font-black text-white hover:bg-orange-700 transition"
      >
        Buy {priceLabel}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">Buy Product</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {priceLabel}
                  {priceType === "subscription" ? "/mo" : ""}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, Number(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
                {stockQuantity !== null && (
                  <p className="mt-1 text-xs text-slate-400">{stockQuantity} in stock</p>
                )}
              </div>

              {/* Buyer info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="Required if not logged in"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Payment method selector */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Select Payment Method
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 text-center transition ${
                      paymentMethod === "card"
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <svg
                      className={`h-6 w-6 mb-1.5 ${paymentMethod === "card" ? "text-orange-600" : "text-slate-400"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    <span className="text-sm font-bold">Card</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">via Stripe</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("crypto")}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 text-center transition ${
                      paymentMethod === "crypto"
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <svg
                      className={`h-6 w-6 mb-1.5 ${paymentMethod === "crypto" ? "text-orange-600" : "text-slate-400"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v10m-3-7h6" />
                    </svg>
                    <span className="text-sm font-bold">Crypto</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">BTC, ETH, USDT+</span>
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}

              {/* Info note */}
              {paymentMethod === "crypto" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 font-semibold">
                  You will be redirected to NOWPayments to complete your crypto payment.
                </div>
              )}

              {/* Pay button */}
              <button
                type="button"
                onClick={handlePay}
                disabled={loading}
                className="w-full rounded-xl bg-orange-600 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[.99]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {paymentMethod === "crypto" ? "Redirecting to NOWPayments…" : "Redirecting to Stripe…"}
                  </span>
                ) : paymentMethod === "crypto" ? (
                  "Pay with Crypto →"
                ) : (
                  "Pay with Card →"
                )}
              </button>

              <p className="text-center text-[11px] text-slate-400">
                Payments secured by Stripe &amp; NOWPayments. No hidden fees.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
