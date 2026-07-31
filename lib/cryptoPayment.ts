/**
 * Shared helpers for tagging/parsing NOWPayments `order_id` values with an
 * explicit kind, so `/api/crypto/webhook` can dispatch to exactly one table
 * instead of blindly probing donations → ticket_orders → businesses in
 * sequence. NOWPayments treats `order_id` as an opaque merchant string and
 * echoes it back verbatim in the IPN callback, so the kind tag survives the
 * round trip with no NOWPayments-side configuration needed.
 *
 * Every crypto checkout-initiation route (create-payment, business-crypto,
 * and future products-crypto) must tag its `order_id` with `tagCryptoOrderId`
 * before sending it to NOWPayments. The webhook is the only place that calls
 * `parseCryptoOrderId`.
 */

export type CryptoPaymentKind = "donation" | "ticket" | "business" | "product";

const KNOWN_KINDS: readonly CryptoPaymentKind[] = ["donation", "ticket", "business", "product"];

export function tagCryptoOrderId(kind: CryptoPaymentKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Returns null for untagged order_ids — i.e. bare UUIDs from invoices created
 * before this tagging scheme shipped. Callers should fall back to the legacy
 * lookup for those rather than treating a parse failure as an error.
 */
export function parseCryptoOrderId(
  orderId: string | null | undefined
): { kind: CryptoPaymentKind; id: string } | null {
  if (!orderId) return null;

  const separatorIndex = orderId.indexOf(":");
  if (separatorIndex === -1) return null;

  const kind = orderId.slice(0, separatorIndex);
  const id = orderId.slice(separatorIndex + 1);

  if (!id || !KNOWN_KINDS.includes(kind as CryptoPaymentKind)) return null;

  return { kind: kind as CryptoPaymentKind, id };
}

export interface NowPaymentsConfig {
  baseUrl: string;
  apiKey: string | undefined;
  ipnSecret: string | undefined;
}

/**
 * Resolves which NOWPayments environment a request should talk to.
 * NOWPAYMENTS_ENV defaults to production whenever unset — sandbox mode is
 * strictly opt-in per deployment, so existing production behavior for real
 * users is untouched unless NOWPAYMENTS_ENV=sandbox is explicitly set.
 */
export function getNowPaymentsConfig(): NowPaymentsConfig {
  const isSandbox = process.env.NOWPAYMENTS_ENV === "sandbox";

  return isSandbox
    ? {
        baseUrl: "https://api-sandbox.nowpayments.io/v1",
        apiKey: process.env.NOWPAYMENTS_SANDBOX_API_KEY,
        ipnSecret: process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET,
      }
    : {
        baseUrl: "https://api.nowpayments.io/v1",
        apiKey: process.env.NOWPAYMENTS_API_KEY,
        ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
      };
}
