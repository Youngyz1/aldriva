"use client";

/**
 * PaymentForm
 * ───────────
 * Universal payment form built on Stripe PaymentElement.
 * Supports ALL Stripe payment methods automatically:
 *   Cards, Apple Pay, Google Pay, Link, ACH, SEPA, Bank Transfer, etc.
 *
 * Must be rendered inside <StripeProvider clientSecret={...}>.
 *
 * Billing-details contract:
 *   When collectName/collectEmail are true the fields are hidden inside
 *   PaymentElement (fields.billingDetails.name/email = "never") and the
 *   values collected by our own inputs are always forwarded through
 *   confirmPayment — even as an empty string, which Stripe accepts.
 *   This avoids the StripeInvalidRequestError that fires when "never" is
 *   declared but the value is omitted from confirmPayment entirely.
 */

import { useState } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";

type Props = {
  onSuccess: () => void;
  onBack?: () => void;
  submitLabel: string;
  accentColor?: string;
  /** Show our own Name input above PaymentElement (hides Stripe's built-in name field) */
  collectName?: boolean;
  /** Show our own Email input above PaymentElement (hides Stripe's built-in email field) */
  collectEmail?: boolean;
  initialName?: string;
  initialEmail?: string;
  onNameChange?: (v: string) => void;
  onEmailChange?: (v: string) => void;
  disabled?: boolean;
  /** Hide our own custom inputs for Name/Email if they are already collected beforehand */
  hideInputs?: boolean;
  /**
   * ISO 3166-1 alpha-2 country to pre-select in the PaymentElement's billing
   * address country field. Without this, Stripe falls back to its own
   * client-side IP geolocation, which is unreliable behind VPNs/proxies —
   * pass the server-resolved value from lib/request-geo.ts's
   * getVisitorCountry() rather than omitting this.
   */
  defaultCountry?: string;
};

export default function PaymentForm({
  onSuccess,
  onBack,
  submitLabel,
  accentColor = "#f97316",
  collectName = false,
  collectEmail = false,
  initialName = "",
  initialEmail = "",
  onNameChange,
  onEmailChange,
  disabled = false,
  hideInputs = false,
  defaultCountry = "US",
}: Props) {
  const stripe = useStripe();
  const elements = useElements();

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elementsReady, setElementsReady] = useState(false);

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || loading || disabled) return;

    setLoading(true);
    setErrorMessage(null);

    // Step 1: validate the PaymentElement's own fields
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message ?? "Please check your payment details.");
      setLoading(false);
      return;
    }

    // Step 2: confirm payment
    // When fields.billingDetails.name/email = "never", Stripe REQUIRES those
    // values to be passed here — even as empty strings.  Conditionally omitting
    // them causes StripeInvalidRequestError, so we always pass them.
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
        payment_method_data: {
          billing_details: {
            // Always supply the value we collected; empty string is acceptable
            ...(collectName ? { name } : {}),
            ...(collectEmail ? { email } : {}),
          },
        },
      },
      // Stay on-page for cards and wallets; redirect only when the payment
      // method itself requires a redirect (e.g. iDEAL, Bancontact, etc.)
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message ?? "Payment failed. Please try again.");
      setLoading(false);
    } else {
      // No error + no redirect = payment succeeded on-page (card / wallet / Link)
      onSuccess();
    }
  }

  // ─── Shared input style ──────────────────────────────────────────────────────

  const inputCls =
    "w-full rounded-[10px] border border-zinc-200 bg-white px-[14px] py-[11px] " +
    "text-[16px] md:text-[14px] font-medium text-zinc-900 outline-none transition " +
    "placeholder:font-normal placeholder:text-zinc-400 " +
    "focus:border-current focus:shadow-[0_0_0_3px] focus:shadow-current/10 " +
    "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400";

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Buyer detail inputs — collected by us, hidden inside PaymentElement */}
      {(collectName || collectEmail) && !hideInputs && (
        <div className="space-y-2.5">
          {collectName && (
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-widest text-zinc-500">
                Name
              </label>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  onNameChange?.(e.target.value);
                }}
                autoComplete="name"
                className={inputCls}
                style={{ "--tw-shadow-color": accentColor } as React.CSSProperties}
              />
            </div>
          )}
          {collectEmail && (
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-widest text-zinc-500">
                Email
              </label>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  onEmailChange?.(e.target.value);
                }}
                autoComplete="email"
                className={inputCls}
                style={{ "--tw-shadow-color": accentColor } as React.CSSProperties}
              />
            </div>
          )}
        </div>
      )}

      {/* Stripe PaymentElement */}
      <div>
        <label className="mb-2.5 block text-[12px] font-semibold uppercase tracking-widest text-zinc-500">
          Payment details
        </label>

        {/* Loading skeleton — shown while Stripe loads the iframe */}
        {!elementsReady && (
          <div className="space-y-3 rounded-[10px] border border-zinc-200 bg-white p-4">
            {/* Tab skeleton */}
            <div className="flex gap-2">
              {[90, 110, 90].map((w, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-[10px] bg-zinc-100"
                  style={{ width: w }}
                />
              ))}
            </div>
            {/* Field skeletons */}
            <div className="h-11 animate-pulse rounded-[10px] bg-zinc-100" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-11 animate-pulse rounded-[10px] bg-zinc-100" />
              <div className="h-11 animate-pulse rounded-[10px] bg-zinc-100" />
            </div>
          </div>
        )}

        {/* Actual PaymentElement — hidden (zero-height) until ready to avoid flash */}
        <div className={elementsReady ? "" : "h-0 overflow-hidden"}>
          <PaymentElement
            onReady={() => setElementsReady(true)}
            options={{
              layout: { type: "tabs", defaultCollapsed: false },
              wallets: {
                googlePay: "auto",
                applePay: "auto",
              },
              // Tell Stripe which fields WE are collecting so it doesn't
              // duplicate them inside its own UI.
              // IMPORTANT: when set to "never", the value MUST be forwarded
              // in confirmPayment.payment_method_data.billing_details.
              fields: {
                billingDetails: {
                  name: collectName ? "never" : "auto",
                  email: collectEmail ? "never" : "auto",
                },
              },
              // Pre-select the billing country from our own server-resolved
              // geolocation instead of leaving it to Stripe's client-side IP
              // detection (unreliable behind VPNs/proxies).
              defaultValues: {
                billingDetails: {
                  address: {
                    country: defaultCountry,
                  },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Inline error */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm font-medium text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* CTA row */}
      <div className={`flex gap-3 ${onBack ? "" : ""}`}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="flex-1 rounded-2xl border border-zinc-200 bg-white py-3.5 text-sm font-bold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
          >
            ← Back
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !stripe || !elementsReady || disabled}
          className="flex-1 rounded-2xl py-3.5 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: accentColor,
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Processing…
            </span>
          ) : (
            submitLabel
          )}
        </button>
      </div>

      {/* Security trust line */}
      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
        <Lock className="h-3 w-3" aria-hidden />
        Secured by Stripe · SSL encrypted
      </p>
    </form>
  );
}
