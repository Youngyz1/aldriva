/**
 * lib/money.ts
 *
 * Phase 3: single currency-aware minor/major-unit helper for NEW
 * order-payment code only (`lib/storefront-order-payments.ts`, order webhook
 * branch). Existing ticket/donation/product routes keep their own `*100`
 * conversions untouched (report lists them as later rewiring candidates).
 *
 * Zero-decimal set follows Stripe's documented zero-decimal currencies
 * (amounts already in the major unit: no ×100). Everything else uses 2
 * decimals. USD therefore behaves identically to today's `*100` logic.
 */

/** Stripe zero-decimal currencies (minor unit == major unit). */
export const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "UYU", "VND", "VUV", "XAF", "XOF",
]);

export function normalizeMoneyCurrency(currency: unknown): string | undefined {
  if (typeof currency !== "string") return undefined;
  const code = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.trim().toUpperCase());
}

/** Major units (e.g. dollars) -> Stripe minor units (e.g. cents). */
export function toMinorUnits(amountMajor: number, currency: string): number {
  if (typeof amountMajor !== "number" || !Number.isFinite(amountMajor) || amountMajor < 0) {
    throw new RangeError("toMinorUnits: amount must be a finite number >= 0");
  }
  const code = normalizeMoneyCurrency(currency);
  if (!code) throw new RangeError("toMinorUnits: currency must be an ISO 4217 code");
  const factor = isZeroDecimalCurrency(code) ? 1 : 100;
  return Math.round(amountMajor * factor);
}

/** Stripe minor units -> major units. */
export function fromMinorUnits(amountMinor: number, currency: string): number {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) {
    throw new RangeError("fromMinorUnits: amount must be a finite number");
  }
  const code = normalizeMoneyCurrency(currency);
  if (!code) throw new RangeError("fromMinorUnits: currency must be an ISO 4217 code");
  const factor = isZeroDecimalCurrency(code) ? 1 : 100;
  return Math.round((amountMinor / factor) * 100) / 100;
}

// ── Display formatting (data-consistency milestone) ───────────────────────────
// ONE display formatter for every surface (Intl-based).
//
// Owner decisions encoded here:
// - Both CFA francs display as "FCFA" with 0 decimals: XOF (West African CFA
//   franc: Côte d'Ivoire, Senegal, Mali, Burkina Faso, Benin, Togo, Niger,
//   Guinea-Bissau) and XAF (Central African CFA franc: Cameroon, Chad,
//   Central African Republic, Republic of the Congo, Equatorial Guinea,
//   Gabon). The codes stay separate in storage, grouping, and totals — XOF
//   and XAF are never merged into one total.
// - When both CFA codes appear together, each line carries its code as a
//   secondary label: "FCFA (XOF)" / "FCFA (XAF)".
// - USD, NGN, and other ISO codes render via Intl; unknown codes degrade to
//   "CODE 1,234.56" instead of throwing (Intl.RangeError on bad codes).

export const CFA_CODES = ["XOF", "XAF"] as const;
export type CfaCode = (typeof CFA_CODES)[number];

export interface FormatMoneyOptions {
  /** BCP-47 locale for grouping/separators. Defaults to "en-US". */
  locale?: string;
  /**
   * Append the ISO code after CFA amounts ("FCFA 1,200 (XOF)"). Used only
   * when both XOF and XAF appear together. Defaults to false.
   */
  cfaQualifier?: boolean;
}

function groupInteger(amount: number, locale: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return Math.round(n).toLocaleString(locale, { maximumFractionDigits: 0 });
}

/**
 * Formats an amount in the given ISO 4217 currency. Never throws: null,
 * NaN, and non-ISO codes degrade to a safe fallback string.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined = "USD",
  locale = "en-US",
  options: FormatMoneyOptions = {}
): string {
  const loc = typeof locale === "string" && locale.trim() ? locale : "en-US";
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const code = normalizeMoneyCurrency(currency) ?? "USD";
  const qualifier =
    options.cfaQualifier && (code === "XOF" || code === "XAF") ? ` (${code})` : "";

  if (code === "XOF" || code === "XAF") {
    return `FCFA ${groupInteger(safe, loc)}${qualifier}`;
  }

  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency: code,
    }).format(safe);
  } catch {
    const grouped = safe.toLocaleString(loc, { maximumFractionDigits: 2 });
    return `${code} ${grouped}`;
  }
}

/**
 * Short display label for a currency in per-currency total lists.
 * CFA codes render "FCFA" (or "FCFA (XOF)"/"FCFA (XAF)" when qualified);
 * everything else renders its ISO code.
 */
export function currencyLabel(
  currency: string | null | undefined,
  options: FormatMoneyOptions = {}
): string {
  const code = normalizeMoneyCurrency(currency) ?? "USD";
  if (code === "XOF" || code === "XAF") {
    return options.cfaQualifier ? `FCFA (${code})` : "FCFA";
  }
  return code;
}

/** True when the code is a CFA franc (either zone). */
export function isCfaCode(currency: string | null | undefined): boolean {
  const code = normalizeMoneyCurrency(currency);
  return code === "XOF" || code === "XAF";
}
