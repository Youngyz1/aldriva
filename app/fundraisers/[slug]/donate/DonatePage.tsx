"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import {
  StripeProvider,
  PaymentForm,
  OrderSummary,
  CheckoutShell,
  formatMoney,
} from "@/components/payments";
import ProgressBar from "@/components/ui/ProgressBar";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESETS = [25, 50, 100, 150, 200, 500];
const TIP_PERCENTAGES = [0, 10, 15, 20];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// crypto.randomUUID() requires a secure context (https:// or localhost).
// This fallback keeps idempotency-key generation working when testing
// over plain http:// on a LAN IP (e.g. from a phone during dev).
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DonatePageProps = {
  fundraiserTitle: string;
  fundraiserSlug: string;
  organizerName: string;
  banner: string;
  raised: number;
  goal: number;
  /** Server-resolved visitor country (see lib/request-geo.ts) for the Stripe PaymentElement's billing address default. */
  defaultCountry?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DonatePage({
  fundraiserTitle,
  fundraiserSlug,
  organizerName,
  banner,
  raised,
  goal,
  defaultCountry,
}: DonatePageProps) {
  // Amount selection
  const [selectedPreset, setSelectedPreset] = useState(50);
  const [customAmount, setCustomAmount] = useState("");

  // Tip
  const [tipPct, setTipPct] = useState(15);
  const [customTip, setCustomTip] = useState("");

  // Donor details
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");

  // Flow state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // UUID minted each time the user clicks "Proceed" — one per checkout attempt
  const [checkoutAttemptId, setCheckoutAttemptId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">("card");
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Receipt state
  const [donationId, setDonationId] = useState<string | null>(null);
  const [isNonprofit, setIsNonprofit] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  useEffect(() => {
    if (success) {
      // 'instant' is not a standard scroll behavior; use 'auto' for immediate jump
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [success]);

  useEffect(() => {
    if (!success || !clientSecret) return;

    setLoadingReceipt(true);
    const piId = clientSecret.split("_secret_")[0];
    let intervalId: any;
    let attempts = 0;

    async function pollLookup() {
      attempts++;
      try {
        const res = await fetch(`/api/receipts/lookup?payment_intent_id=${piId}`);
        if (res.ok) {
          const data = await res.json();
          setDonationId(data.id);
          setIsNonprofit(data.is_nonprofit);
          setLoadingReceipt(false);
          clearInterval(intervalId);
        } else if (attempts > 15) {
          setLoadingReceipt(false);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Receipt lookup error:", err);
      }
    }

    intervalId = setInterval(pollLookup, 2000);
    pollLookup();

    return () => clearInterval(intervalId);
  }, [success, clientSecret]);

  // ─── Derived amounts ────────────────────────────────────────────────────────

  const donationAmount = (() => {
    const raw = customAmount ? Number(customAmount) : selectedPreset;
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  })();

  const tipAmount = (() => {
    if (customTip) {
      const raw = Number(customTip);
      return Number.isFinite(raw) && raw >= 0 ? raw : 0;
    }
    if (tipPct > 0 && donationAmount >= 1) {
      return Math.round(donationAmount * (tipPct / 100) * 100) / 100;
    }
    return 0;
  })();

  const total = donationAmount + tipAmount;
  const pct = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;

  // ─── Create PaymentIntent ────────────────────────────────────────────────────

  async function handleProceedToPayment() {
    if (donationAmount < 1) {
      setPaymentError("Please select a donation amount of at least $1.");
      return;
    }
    setPaymentError(null);

    if (paymentMethod === "crypto") {
      setIsRedirecting(true);
      try {
        const res = await fetch("/api/crypto/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: total,
            currency: "usd",
            fundraiserSlug,
            donorName: anonymous ? "Anonymous" : donorName,
            donorEmail,
            type: "donation",
            message,
            anonymous,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.paymentUrl) {
          throw new Error(data.error || "Could not start the crypto payment.");
        }
        window.location.href = data.paymentUrl;
      } catch (err) {
        setPaymentError(
          err instanceof Error ? err.message : "Could not initialise crypto payment."
        );
        setIsRedirecting(false);
      }
      return;
    }

    // Mint a fresh UUID for this attempt so the idempotency key is
    // unique per-click, preventing StripeIdempotencyError on retry.
    const attemptId = generateUUID();
    setCheckoutAttemptId(attemptId);
    setPreparingPayment(true);

    try {
      const res = await fetch("/api/donate/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: donationAmount,
          tip: tipAmount,
          fundraiserSlug,
          fundraiserTitle,
          donorName: anonymous ? "Anonymous" : donorName,
          donorEmail,
          message,
          anonymous,
          currency: "usd",
          checkoutAttemptId: attemptId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start the payment.");
      }
      setClientSecret(data.clientSecret);
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Could not initialise payment."
      );
    } finally {
      setPreparingPayment(false);
    }
  }

  // ─── Success screen ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-black">Thank you!</h1>
          <p className="mt-3 text-zinc-500">
            Your donation of{" "}
            <span className="font-black text-green-700">
              {formatMoney(total)}
            </span>{" "}
            to <span className="font-semibold">{fundraiserTitle}</span> has
            been received.
          </p>

          <hr className="my-6 border-zinc-200" />

          {loadingReceipt ? (
            <div className="flex flex-col items-center justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
              <p className="mt-2 text-xs font-semibold text-zinc-400">Generating receipt…</p>
            </div>
          ) : donationId ? (
            <div className="space-y-4">
              <a
                href={`/api/receipts/${donationId}`}
                className="block w-full rounded-2xl bg-green-700 py-3.5 text-sm font-black text-white hover:bg-green-800 transition shadow-sm"
              >
                Download Receipt PDF
              </a>
              {isNonprofit ? (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-left text-xs text-emerald-800 leading-relaxed">
                  <span className="font-black block mb-1">★ Tax-Deductible Donation</span>
                  This fundraiser is run by a registered nonprofit. Your contribution qualifies for tax-deductible benefits.
                </div>
              ) : (
                <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4 text-left text-xs text-zinc-500 leading-relaxed">
                  <span className="font-bold block mb-1">Standard Donation</span>
                  This is a standard donation receipt. Donations to individuals are generally not tax-deductible.
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">
              Receipt will be emailed to you shortly.
            </p>
          )}

          <Link
            href={`/fundraisers/${fundraiserSlug}`}
            className="mt-6 block text-center text-sm font-black text-zinc-500 hover:text-zinc-950 transition"
          >
            Back to fundraiser
          </Link>
        </div>
      </main>
    );
  }

  // ─── Left column — amount + donor details + payment ─────────────────────────

  const leftColumn = (
    <>
      {/* Fundraiser banner */}
      <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <img
          src={banner}
          alt={fundraiserTitle}
          className="h-16 w-20 shrink-0 rounded-xl object-cover sm:w-24"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            You&apos;re supporting
          </p>
          <h2 className="mt-0.5 truncate text-base font-black">
            {fundraiserTitle}
          </h2>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            Your donation will benefit {organizerName}
          </p>
        </div>
      </div>

      {/* Amount picker */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h3 className="mb-4 text-base font-black text-zinc-950">Choose an amount</h3>
        <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 sm:grid-cols-6">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setSelectedPreset(preset);
                setCustomAmount("");
                setClientSecret(null); // reset intent when amount changes
              }}
              className={`rounded-xl border py-3 min-h-[48px] text-sm font-black transition active:scale-[0.98] ${
                selectedPreset === preset && !customAmount
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 hover:border-emerald-300 text-zinc-800"
              }`}
            >
              ${preset}
            </button>
          ))}
        </div>
        <div className="relative mt-3">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-zinc-400">
            $
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedPreset(0);
              setClientSecret(null); // reset intent when amount changes
            }}
            placeholder="Other amount"
            className="w-full rounded-xl border border-zinc-200 py-3 pl-8 pr-16 text-[16px] md:text-base font-black outline-none transition focus:border-emerald-600"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
            .00
          </span>
        </div>
      </div>

      {/* Tip selector */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h3 className="mb-1 text-base font-black text-zinc-950">
          Add a tip{" "}
          <span className="text-sm font-normal text-zinc-400">(optional)</span>
        </h3>
        <p className="mb-4 text-xs text-zinc-400">
          Tips help us keep the platform running.
        </p>
        <div className="flex flex-wrap gap-2">
          {TIP_PERCENTAGES.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setTipPct(pct);
                setCustomTip("");
                setClientSecret(null);
              }}
              className={`rounded-xl border px-4 py-2.5 min-h-[44px] text-sm font-black transition active:scale-[0.98] ${
                tipPct === pct && !customTip
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 hover:border-emerald-300 text-zinc-800"
              }`}
            >
              {pct === 0 ? "None" : `${pct}%`}
            </button>
          ))}
        </div>
        {tipPct > 0 && !customTip && donationAmount >= 1 && (
          <p className="mt-2 text-xs text-zinc-400">
            = {formatMoney(tipAmount)} tip on {formatMoney(donationAmount)}{" "}
            donation
          </p>
        )}
      </div>

      {/* Donor details */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-3">
        <h3 className="text-base font-black text-zinc-950">Your details</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Your name (optional)"
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            disabled={anonymous}
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-[16px] md:text-base outline-none transition focus:border-emerald-600 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={donorEmail}
            onChange={(e) => setDonorEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-[16px] md:text-base outline-none transition focus:border-emerald-600"
          />
        </div>

        <textarea
          placeholder="Leave a message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[16px] md:text-base text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-600 resize-none"
        />

        <label className="flex cursor-pointer items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          <span className="text-sm text-zinc-600">
            Don&apos;t display my name publicly
          </span>
        </label>
      </div>

      {/* Error */}
      {paymentError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {paymentError}
        </div>
      )}

      {/* Payment selector */}
      {!clientSecret && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4">
          <h3 className="text-base font-black text-zinc-950">Select Payment Method</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition min-h-[72px] active:scale-[0.98] ${
                paymentMethod === "card"
                  ? "border-emerald-600 bg-emerald-50/50 text-emerald-800 font-bold shadow-sm"
                  : "border-zinc-200 hover:border-zinc-300 text-zinc-600 font-medium"
              }`}
            >
              <svg
                className={`h-6 w-6 mb-1.5 ${paymentMethod === "card" ? "text-emerald-600" : "text-zinc-400"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
              <span className="text-sm">Pay with Card</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("crypto")}
              className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition min-h-[72px] active:scale-[0.98] ${
                paymentMethod === "crypto"
                  ? "border-emerald-600 bg-emerald-50/50 text-emerald-800 font-bold shadow-sm"
                  : "border-zinc-200 hover:border-zinc-300 text-zinc-600 font-medium"
              }`}
            >
              <svg
                className={`h-6 w-6 mb-1.5 ${paymentMethod === "crypto" ? "text-emerald-600" : "text-zinc-400"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v10m-3-7h6" />
              </svg>
              <span className="text-sm">Pay with Crypto</span>
            </button>
          </div>
        </div>
      )}

      {/* Payment section */}
      {!clientSecret ? (
        /* Step 1 — Proceed button */
        <button
          onClick={handleProceedToPayment}
          disabled={preparingPayment || isRedirecting || donationAmount < 1}
          className="w-full min-h-[52px] rounded-2xl bg-emerald-600 py-4 text-base font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 active:scale-[0.99]"
        >
          {preparingPayment || isRedirecting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {isRedirecting ? "Redirecting to payment…" : "Setting up…"}
            </span>
          ) : (
            paymentMethod === "crypto"
              ? `Donate ${donationAmount >= 1 ? formatMoney(total) : "now"} with Crypto →`
              : `Donate ${donationAmount >= 1 ? formatMoney(total) : "now"} →`
          )}
        </button>
      ) : (
        /* Step 2 — Stripe PaymentElement (inline, no redirect) */
        <StripeProvider clientSecret={clientSecret} accentColor="#16a34a">
          <PaymentForm
            submitLabel={`Donate ${formatMoney(total)}`}
            accentColor="#16a34a"
            onSuccess={() => setSuccess(true)}
            onBack={() => {
              setClientSecret(null);
              setCheckoutAttemptId(null); // next attempt gets a new UUID
            }}
            // Pass the name/email the user already entered so Stripe
            // billing_details are populated without duplicating the fields
            collectName={false}
            collectEmail={false}
            defaultCountry={defaultCountry}
          />
        </StripeProvider>
      )}

      <p className="text-center text-xs text-zinc-400">
        By donating, you agree to our{" "}
        <a href="/privacy" className="underline hover:text-zinc-600">
          Privacy Policy
        </a>
        . Payments are processed securely via Stripe or NOWPayments.
      </p>

    </>
  );

  // ─── Right column — order summary + fundraiser progress ─────────────────────

  const rightColumn = (
    <>
      <OrderSummary
        title="Your donation"
        accentColor="#16a34a"
        currency="USD"
        items={[
          {
            label: "Donation",
            value: donationAmount >= 1 ? donationAmount : 0,
          },
          {
            label: "Tip (optional)",
            value: tipAmount,
            muted: tipAmount === 0,
          },
        ]}
        total={total}
      >
        <div className="pt-2">
          <ProgressBar raised={raised} goal={goal} percentage={pct} height={8} showLabel={true} />
        </div>
      </OrderSummary>

      {/* Donation protection badge */}
      <div className="flex items-start gap-3 rounded-2xl border border-green-100 bg-green-50 p-4">
        <ShieldCheck className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
        <p className="text-xs leading-5 text-green-800">
          <span className="font-black">Donation Protection Guarantee — </span>
          We guarantee a full refund if something is not right.
        </p>
      </div>
    </>
  );

  // ─── Layout ──────────────────────────────────────────────────────────────────

  return (
    <CheckoutShell
      backHref={`/fundraisers/${fundraiserSlug}`}
      backLabel="Back to fundraiser"
      left={leftColumn}
      right={rightColumn}
      legalText={
        <>
          Donations processed securely via Stripe or NOWPayments.{" "}
          <a href="/privacy" className="underline hover:text-zinc-600">
            Privacy Policy
          </a>
          .
        </>
      }
    />
  );
}