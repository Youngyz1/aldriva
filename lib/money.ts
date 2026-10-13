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
