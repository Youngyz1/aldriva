"use client";

/**
 * StripeProvider
 * ──────────────
 * Singleton loadStripe() instance shared across all checkout flows.
 * Wrap any component that uses <PaymentForm> with this provider.
 *
 * Props
 *   clientSecret  – required, the PaymentIntent client_secret
 *   accentColor   – optional, defaults to orange (#f97316) for events;
 *                   pass "#16a34a" for donation (green) flows
 *   children      – rendered inside <Elements>
 */

import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";

// Single instance — never call loadStripe() more than once per app load.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// Plus Jakarta Sans — the site's global font.
// Stripe Elements render inside a cross-origin iframe, so they cannot
// inherit fonts from the host page. We must supply the font source
// explicitly via the `fonts` array so the iframe can load it.
const SITE_FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";

const FONT_FAMILY =
  '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

type Props = {
  clientSecret: string;
  accentColor?: string;
  children: React.ReactNode;
};

export default function StripeProvider({
  clientSecret,
  accentColor = "#f97316",
  children,
}: Props) {
  const options: StripeElementsOptions = {
    clientSecret,

    // Inject the site font into the Stripe iframe
    fonts: [{ cssSrc: SITE_FONT_CSS }],

    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: accentColor,
        colorBackground: "#ffffff",
        colorText: "#18181b",
        colorTextSecondary: "#71717a",
        colorDanger: "#dc2626",
        colorIconCardError: "#dc2626",
        borderRadius: "10px",
        // Font — must match the cssSrc font name exactly
        fontFamily: FONT_FAMILY,
        fontSizeBase: "14px",
        fontWeightNormal: "500",
        fontWeightMedium: "600",
        fontWeightBold: "700",
        spacingUnit: "4px",
        spacingGridRow: "16px",
        spacingGridColumn: "12px",
      },
      rules: {
        ".Input": {
          border: "1px solid #e4e4e7",
          borderRadius: "10px",
          boxShadow: "none",
          padding: "11px 14px",
          fontSize: "14px",
          fontWeight: "500",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        },
        ".Input:focus": {
          border: `1px solid ${accentColor}`,
          boxShadow: `0 0 0 3px ${accentColor}1a`,
          outline: "none",
        },
        ".Input--invalid": {
          border: "1px solid #dc2626",
          boxShadow: "0 0 0 3px #dc26261a",
        },
        ".Input::placeholder": {
          color: "#a1a1aa",
          fontWeight: "400",
        },
        ".Label": {
          fontFamily: FONT_FAMILY,
          fontWeight: "600",
          fontSize: "12px",
          color: "#52525b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "6px",
        },
        ".Error": {
          fontFamily: FONT_FAMILY,
          fontSize: "12px",
          fontWeight: "500",
          color: "#dc2626",
          marginTop: "4px",
        },
        // Tab row (Card / Apple Pay / Google Pay / etc.)
        ".Tab": {
          border: "1px solid #e4e4e7",
          borderRadius: "10px",
          boxShadow: "none",
          padding: "10px 12px",
          fontFamily: FONT_FAMILY,
          fontWeight: "600",
          fontSize: "13px",
          color: "#52525b",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          backgroundColor: "#fafafa",
        },
        ".Tab:hover": {
          border: "1px solid #a1a1aa",
          color: "#18181b",
          backgroundColor: "#f4f4f5",
        },
        ".Tab--selected": {
          border: `1px solid ${accentColor}`,
          boxShadow: `0 0 0 2px ${accentColor}22`,
          color: accentColor,
          backgroundColor: "#ffffff",
          fontWeight: "700",
        },
        ".Tab--selected:focus": {
          boxShadow: `0 0 0 3px ${accentColor}33`,
        },
        ".TabIcon--selected": {
          fill: accentColor,
        },
        ".TabLabel--selected": {
          color: accentColor,
        },
        ".Block": {
          borderRadius: "10px",
        },
        ".CheckboxInput": {
          borderRadius: "4px",
          border: "1px solid #e4e4e7",
        },
        ".CheckboxInput--checked": {
          backgroundColor: accentColor,
          borderColor: accentColor,
        },
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}
