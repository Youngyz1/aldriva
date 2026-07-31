"use client";

import { useState } from "react";
import Link from "next/link";

type Business = {
  id: string;
  name: string;
  slug: string;
  status: string;
  listing_tier: string;
  is_featured: boolean;
};

type PaymentMethod = "card" | "crypto";

const TIER_AMOUNTS: Record<string, string> = {
  one_time: "$49",
  subscription: "$19/mo",
};

export default function BusinessRowActions({
  business,
  onDelete,
}: {
  business: Business;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment is now an optional Featured upgrade, decoupled from publish
  // status — offer it whenever the owner picked a paid tier but hasn't
  // actually paid yet, regardless of whether the listing itself is live.
  const needsPayment =
    business.listing_tier !== "free" && !business.is_featured;

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      if (paymentMethod === "crypto") {
        const res = await fetch("/api/checkout/business-crypto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId: business.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.paymentUrl) {
          throw new Error(data.error || "Failed to start crypto payment.");
        }
        window.location.href = data.paymentUrl;
      } else {
        const res = await fetch("/api/checkout/business", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId: business.id }),
        });
        const data = await res.json();
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

  const tierLabel =
    business.listing_tier === "one_time"
      ? "Featured (Lifetime)"
      : business.listing_tier === "subscription"
      ? "Premium Partner (Monthly)"
      : business.listing_tier;

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {needsPayment && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-black text-white hover:bg-orange-700 transition"
          >
            Upgrade to Featured
          </button>
        )}

        {(business.status === "active" || business.status === "pending_review") && (
          <Link
            href={`/businesses/${business.slug}`}
            target="_blank"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
          >
            {business.status === "active" ? "View Public" : "Preview"}
          </Link>
        )}

        <Link
          href={`/dashboard/businesses/${business.id}/edit`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
        >
          Edit
        </Link>

        <form
          action={onDelete}
          onSubmit={(e) => {
            if (!confirm("Are you sure you want to delete this business listing?")) {
              e.preventDefault();
            }
          }}
          className="inline-block"
        >
          <input type="hidden" name="id" value={business.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition"
          >
            Delete
          </button>
        </form>
      </div>

      {/* Payment Method Modal */}
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
                <h2 className="text-base font-black text-slate-900">
                  Upgrade to Featured
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {business.name} — {tierLabel}{" "}
                  <span className="font-bold text-orange-600">
                    {TIER_AMOUNTS[business.listing_tier]}
                  </span>
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
                  You will be redirected to NOWPayments to complete your crypto payment. Your listing will be activated automatically once the payment is confirmed on-chain.
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
                  `Pay ${TIER_AMOUNTS[business.listing_tier] ?? ""} with Crypto →`
                ) : (
                  `Pay ${TIER_AMOUNTS[business.listing_tier] ?? ""} with Card →`
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
