/**
 * lib/promo-codes.ts
 *
 * Tenant-scoped promo/discount codes for the Store multi-item cart
 * (migration 177). Percent XOR fixed-amount, optional validity window,
 * optional usage cap counted at webhook-paid time.
 *
 * All money math is integer minor units; the checkout route converts with
 * toMinorUnits/fromMinorUnits. No client input is trusted: validatePromoCode
 * re-checks every rule server-side from the live row.
 */

export interface PromoCodeRow {
  id: string;
  tenant_id: string;
  code: string;
  percent_off: number | null;
  fixed_off_minor: number | null;
  fixed_currency: string | null;
  min_subtotal_minor: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface ValidatedPromo {
  id: string;
  code: string;
  percentOff: number | null;
  fixedOffMinor: number | null;
  fixedCurrency: string | null;
  minSubtotalMinor: number;
}

export const PROMO_CODE_MIN_LENGTH = 3;
export const PROMO_CODE_MAX_LENGTH = 40;
export const PROMO_PERCENT_MIN = 1;
export const PROMO_PERCENT_MAX = 90;

/** Normalize user-typed codes: trim + uppercase (uniqueness is lower(code)). */
export function normalizePromoCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function validatePromoRow(
  row: PromoCodeRow,
  tenantId: string,
  now: number = Date.now()
): { ok: true; promo: ValidatedPromo } | { ok: false; error: string } {
  if (row.tenant_id !== tenantId) {
    return { ok: false, error: "This code is not valid for this store." };
  }
  if (!row.is_active) {
    return { ok: false, error: "This code is no longer active." };
  }
  if (row.starts_at && Date.parse(row.starts_at) > now) {
    return { ok: false, error: "This code is not valid yet." };
  }
  if (row.expires_at && Date.parse(row.expires_at) <= now) {
    return { ok: false, error: "This code has expired." };
  }
  if (row.max_uses !== null && row.used_count >= row.max_uses) {
    return { ok: false, error: "This code has reached its usage limit." };
  }
  if (row.percent_off !== null) {
    if (
      !Number.isInteger(row.percent_off) ||
      row.percent_off < PROMO_PERCENT_MIN ||
      row.percent_off > PROMO_PERCENT_MAX
    ) {
      return { ok: false, error: "This code is misconfigured." };
    }
    if (row.fixed_off_minor !== null || row.fixed_currency !== null) {
      return { ok: false, error: "This code is misconfigured." };
    }
    return {
      ok: true,
      promo: {
        id: row.id,
        code: row.code,
        percentOff: row.percent_off,
        fixedOffMinor: null,
        fixedCurrency: null,
        minSubtotalMinor: Math.max(0, row.min_subtotal_minor),
      },
    };
  }
  if (
    row.fixed_off_minor === null ||
    !Number.isInteger(row.fixed_off_minor) ||
    row.fixed_off_minor <= 0 ||
    typeof row.fixed_currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.fixed_currency)
  ) {
    return { ok: false, error: "This code is misconfigured." };
  }
  return {
    ok: true,
    promo: {
      id: row.id,
      code: row.code,
      percentOff: null,
      fixedOffMinor: row.fixed_off_minor,
      fixedCurrency: row.fixed_currency,
      minSubtotalMinor: Math.max(0, row.min_subtotal_minor),
    },
  };
}

export interface PromoApplication {
  /** Total discount in minor units actually applied (0 when inapplicable). */
  discountMinor: number;
  /** Subtotal after discount, never negative. */
  totalMinor: number;
  /** True when the code failed the minimum-subtotal rule. */
  belowMinimum: boolean;
}

/**
 * Pure discount math. Percent rounds half-up per minor unit; fixed is capped
 * at the subtotal and currency-gated by the caller (fixed applies only when
 * the cart currency matches — enforced in the checkout route, not here).
 */
export function applyPromoToSubtotal(
  subtotalMinor: number,
  promo: ValidatedPromo,
  cartCurrency: string
): PromoApplication {
  if (promo.percentOff !== null) {
    if (subtotalMinor < promo.minSubtotalMinor) {
      return { discountMinor: 0, totalMinor: subtotalMinor, belowMinimum: true };
    }
    const discountMinor = Math.min(
      subtotalMinor,
      Math.round((subtotalMinor * promo.percentOff) / 100)
    );
    return { discountMinor, totalMinor: subtotalMinor - discountMinor, belowMinimum: false };
  }
  if (
    promo.fixedCurrency !== cartCurrency.toUpperCase() ||
    subtotalMinor < promo.minSubtotalMinor
  ) {
    return { discountMinor: 0, totalMinor: subtotalMinor, belowMinimum: subtotalMinor < promo.minSubtotalMinor };
  }
  const discountMinor = Math.min(subtotalMinor, promo.fixedOffMinor ?? 0);
  return { discountMinor, totalMinor: subtotalMinor - discountMinor, belowMinimum: false };
}

export interface PromoClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          maybeSingle(): Promise<{ data: PromoCodeRow | null; error: unknown }>;
        };
      };
    };
  };
}

/**
 * Fetch a tenant's code by its normalized value. The client is injected so
 * tests run hermetic; routes pass the service-role client.
 *
 * Convention (enforced wherever codes are written): codes are stored
 * UPPERCASE, so exact match on the normalized value is sufficient while the
 * UNIQUE (tenant_id, lower(code)) index keeps mixed-case writes colliding.
 */
export async function fetchTenantPromoCode(
  client: PromoClient,
  tenantId: string,
  code: string
): Promise<PromoCodeRow | null> {
  const normalized = normalizePromoCode(code);
  if (
    normalized.length < PROMO_CODE_MIN_LENGTH ||
    normalized.length > PROMO_CODE_MAX_LENGTH
  ) {
    return null;
  }
  const { data, error } = await client
    .from("promo_codes")
    .select(
      "id, tenant_id, code, percent_off, fixed_off_minor, fixed_currency, min_subtotal_minor, max_uses, used_count, starts_at, expires_at, is_active"
    )
    .eq("tenant_id", tenantId)
    .eq("code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
