"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { generateUUID } from "@/lib/uuid";
import { safeImageSrc } from "@/lib/image-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import Link from "next/link";
import { ShieldCheck, CreditCard, Coins, Heart } from "lucide-react";
import {
  StripeProvider,
  PaymentForm,
  CheckoutShell,
  formatMoney,
} from "@/components/payments";
import ProgressBar from "@/components/ui/ProgressBar";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";

// ─── Constants ────────────────────────────────────────────────────────────────

// Tip is now a continuous slider (0–30%) instead of fixed chips, mirroring
// GoFundMe's checkout. Keep a couple of anchor points for the tick labels.
const TIP_MIN = 0;
const TIP_MAX = 30;

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
  // Amount — free-typed by the donor, no preset chips
  const [amount, setAmount] = useState("50");

  // Tip — now driven by a slider (0–30%), with an option to type an exact %.
  const [tipPct, setTipPct] = useState(15);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);

  // Give once / Monthly toggle — UI only for now; monthly billing isn't
  // wired up on the backend yet, so the Monthly option is shown but disabled.
  const [showMonthlySoon, setShowMonthlySoon] = useState(false);

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
  const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">("card");
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Receipt state
  const [donationId, setDonationId] = useState<string | null>(null);
  const [isNonprofit, setIsNonprofit] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  useEffect(() => {
    if (success) {
      window.scrollTo({ top: 0, behavior: "instant" });
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
    const raw = Number(amount);
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
  const pct = calculateFundraisingPercentage(raised, goal);

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
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-10 text-center">
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
                <div className="rounded-2xl bg-brand-50 border border-brand-100 p-4 text-left text-xs text-brand-900 leading-relaxed">
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
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:w-24">
          {safeImageSrc(banner) ? (
            <Image
              src={safeImageSrc(banner)!}
              alt={fundraiserTitle}
              fill
              sizes="(max-width: 640px) 80px, 96px"
              className="object-cover"
            />
          ) : (
            <LocalBrandedPlaceholder variant="fundraiser" title={fundraiserTitle} />
          )}
        </div>
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

      {/* Raised amount — sits directly below the campaign card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">
            ${raised.toLocaleString()} raised
          </span>
          <span className="font-black text-green-700">{pct}%</span>
        </div>
        <ProgressBar percentage={pct} height={8} />
        {goal > 0 && (
          <p className="text-xs text-zinc-400">
            Goal: ${goal.toLocaleString()}
          </p>
        )}
      </div>

      {/* Give once / Monthly toggle — Monthly is disabled until recurring billing is wired up */}
      <div className="relative">
        <div className="inline-flex w-full overflow-hidden rounded-full border border-zinc-200 bg-white p-1 sm:w-auto">
          <span className="flex-1 rounded-full bg-green-700 px-6 py-2.5 text-center text-sm font-black text-white sm:flex-initial">
            Give once
          </span>
          <button
            type="button"
            onClick={() => setShowMonthlySoon((v) => !v)}
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold text-zinc-400 sm:flex-initial"
          >
            Monthly
            <Heart className="h-3.5 w-3.5" />
          </button>
        </div>
        {showMonthlySoon && (
          <div className="absolute left-0 top-full z-10 mt-2 rounded-xl border border-zinc-200 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-lg">
            Monthly giving is coming soon
          </div>
        )}
      </div>

      {/* Amount picker — donor types the amount themselves, no preset chips */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="mb-4 text-base font-black">Enter your donation</h3>

        <div className="relative flex items-center rounded-2xl border-2 border-zinc-200 px-5 py-4 transition focus-within:border-green-500">
          <span className="text-3xl font-black text-zinc-300">$</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setClientSecret(null); // reset intent when amount changes
            }}
            placeholder="0"
            className="w-full border-none bg-transparent pl-2 text-3xl font-black text-zinc-900 outline-none placeholder:text-zinc-300"
          />
          <span className="text-sm font-semibold text-zinc-300">USD</span>
        </div>
      </div>

      {/* Tip selector — slider instead of fixed chips, matching GoFundMe */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="mb-1 text-base font-black">Add a tip to fundgood</h3>
        <p className="mb-5 text-xs text-zinc-400">
          fundgood has a 0% platform fee for organisers — we rely on the
          generosity of donors like you to operate our service.
        </p>

        {!showCustomTip ? (
          <>
            <div className="text-center">
              <span className="text-2xl font-black text-zinc-900">
                {customTip ? Number(customTip) : tipPct}%
              </span>
            </div>
            <input
              type="range"
              min={TIP_MIN}
              max={TIP_MAX}
              step={0.5}
              value={tipPct}
              onChange={(e) => {
                setTipPct(Number(e.target.value));
                setCustomTip("");
                setClientSecret(null);
              }}
              className="mt-3 w-full accent-green-600"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
              <span>0%</span>
              <span>{TIP_MAX}%</span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomTip(true)}
              className="mx-auto mt-4 block text-xs font-bold text-zinc-500 underline hover:text-zinc-800"
            >
              Enter custom tip
            </button>
          </>
        ) : (
          <div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-zinc-400">
                %
              </span>
              <input
                type="number"
                min="0"
                step="0.5"
                autoFocus
                value={customTip}
                onChange={(e) => {
                  setCustomTip(e.target.value);
                  setClientSecret(null);
                }}
                placeholder="Custom tip %"
                className="w-full rounded-xl border border-zinc-200 py-3 pl-8 pr-4 text-base font-black outline-none transition focus:border-green-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCustomTip(false);
                setCustomTip("");
              }}
              className="mx-auto mt-3 block text-xs font-bold text-zinc-500 underline hover:text-zinc-800"
            >
              Use slider instead
            </button>
          </div>
        )}

        {donationAmount >= 1 && tipAmount > 0 && (
          <p className="mt-3 text-center text-xs text-zinc-400">
            = {formatMoney(tipAmount)} tip on {formatMoney(donationAmount)}{" "}
            donation
          </p>
        )}
      </div>

      {/* Donor details */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-3">
        <h3 className="text-base font-black">Your details</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Your name (optional)"
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            disabled={anonymous}
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-green-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={donorEmail}
            onChange={(e) => setDonorEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-green-500"
          />
        </div>

        <textarea
          placeholder="Leave a message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-green-500 resize-none"
        />

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="h-4 w-4 accent-green-600"
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

      {/* Payment method — vertical radio-row list, GoFundMe style, instead of a 2-up button grid */}
      {!clientSecret && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <h3 className="px-6 pt-6 pb-3 text-base font-black text-zinc-950">
            Payment method
          </h3>

          <button
            type="button"
            onClick={() => setPaymentMethod("card")}
            className="flex w-full items-center gap-4 border-t border-zinc-100 px-6 py-4 text-left transition hover:bg-zinc-50"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                paymentMethod === "card" ? "border-green-600" : "border-zinc-300"
              }`}
            >
              {paymentMethod === "card" && (
                <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
              )}
            </span>
            <CreditCard
              className={`h-5 w-5 shrink-0 ${
                paymentMethod === "card" ? "text-green-600" : "text-zinc-400"
              }`}
            />
            <span
              className={`text-sm ${
                paymentMethod === "card" ? "font-bold text-zinc-900" : "text-zinc-600"
              }`}
            >
              Credit or debit card
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod("crypto")}
            className="flex w-full items-center gap-4 border-t border-zinc-100 px-6 py-4 text-left transition hover:bg-zinc-50"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                paymentMethod === "crypto" ? "border-green-600" : "border-zinc-300"
              }`}
            >
              {paymentMethod === "crypto" && (
                <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
              )}
            </span>
            <Coins
              className={`h-5 w-5 shrink-0 ${
                paymentMethod === "crypto" ? "text-green-600" : "text-zinc-400"
              }`}
            />
            <span
              className={`text-sm ${
                paymentMethod === "crypto" ? "font-bold text-zinc-900" : "text-zinc-600"
              }`}
            >
              Crypto
            </span>
          </button>
        </div>
      )}

      {/* Payment section */}
      {!clientSecret ? (
        /* Step 1 — Proceed button */
        <button
          onClick={handleProceedToPayment}
          disabled={preparingPayment || isRedirecting || donationAmount < 1}
          className="w-full rounded-2xl bg-green-700 py-4 text-base font-black text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-300 active:scale-[.99]"
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

  // ─── Right column — donation protection badge only ───────────────────────────
  // The donation/tip/total breakdown and the raised-amount progress used to
  // live here (inside an OrderSummary card). The total is now only shown on
  // the CTA button, and the raised/progress card moved into the left column,
  // directly under the campaign card, per the latest layout.

  const rightColumn = (
    <div className="flex items-start gap-3 rounded-2xl border border-green-100 bg-green-50 p-4">
      <ShieldCheck className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
      <p className="text-xs leading-5 text-green-800">
        <span className="font-black">Donation Protection Guarantee — </span>
        We guarantee a full refund if something is not right.
      </p>
    </div>
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