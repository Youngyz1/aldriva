/**
 * lib/delivery-settings.ts
 *
 * Owner-managed delivery settings under tenant_websites.metadata.storefront.delivery.
 * Pure validation, extraction, and fee calculation (no "use server", zero I/O).
 */

import { isValidPhoneNumber, normalizePhone } from "@/lib/order-phone";

export interface DeliverySettings {
  fee: number;
  free_above: number | null;
  courier_whatsapp: string | null;
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  fee: 0,
  free_above: null,
  courier_whatsapp: null,
};

const MAX_DELIVERY_FEE = 100000; // 100,000 XOF max bound
const MAX_FREE_ABOVE = 1000000; // 1,000,000 XOF max bound

/**
 * Safely extracts validated DeliverySettings from tenant_websites metadata.
 * Returns default (fee 0, no free threshold, no courier number) when unset.
 */
export function extractDeliverySettings(metadata: unknown): DeliverySettings {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ...DEFAULT_DELIVERY_SETTINGS };
  }

  const storefront = (metadata as Record<string, unknown>).storefront;
  if (!storefront || typeof storefront !== "object" || Array.isArray(storefront)) {
    return { ...DEFAULT_DELIVERY_SETTINGS };
  }

  const rawDelivery = (storefront as Record<string, unknown>).delivery;
  if (!rawDelivery || typeof rawDelivery !== "object" || Array.isArray(rawDelivery)) {
    return { ...DEFAULT_DELIVERY_SETTINGS };
  }

  const d = rawDelivery as Record<string, unknown>;

  let fee = 0;
  if (typeof d.fee === "number" && Number.isFinite(d.fee) && d.fee >= 0) {
    fee = Math.min(Math.round(d.fee), MAX_DELIVERY_FEE);
  }

  let free_above: number | null = null;
  if (typeof d.free_above === "number" && Number.isFinite(d.free_above) && d.free_above > 0) {
    free_above = Math.min(Math.round(d.free_above), MAX_FREE_ABOVE);
  }

  let courier_whatsapp: string | null = null;
  if (typeof d.courier_whatsapp === "string" && d.courier_whatsapp.trim()) {
    const clean = normalizePhone(d.courier_whatsapp.trim());
    if (isValidPhoneNumber(clean)) {
      courier_whatsapp = clean;
    }
  }

  return { fee, free_above, courier_whatsapp };
}

export interface ValidateDeliverySettingsInput {
  fee?: unknown;
  free_above?: unknown;
  courier_whatsapp?: unknown;
}

export type ValidateDeliverySettingsResult =
  | { valid: true; settings: DeliverySettings }
  | { valid: false; error: string };

/**
 * Strictly validates user-submitted delivery settings.
 * Drops unknown keys. Ensures numeric bounds and valid phone format.
 */
export function validateDeliverySettings(
  input: ValidateDeliverySettingsInput
): ValidateDeliverySettingsResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "Invalid delivery settings payload." };
  }

  // 1. Fee validation (required, integer >= 0, <= 100000)
  const rawFee = input.fee;
  if (typeof rawFee !== "number" || !Number.isFinite(rawFee) || rawFee < 0) {
    return { valid: false, error: "Delivery fee must be a number greater than or equal to 0." };
  }
  if (rawFee > MAX_DELIVERY_FEE) {
    return { valid: false, error: `Delivery fee cannot exceed ${MAX_DELIVERY_FEE}.` };
  }
  const fee = Math.round(rawFee);

  // 2. Free delivery threshold (optional, null or number > 0)
  let free_above: number | null = null;
  if (input.free_above !== null && input.free_above !== undefined && input.free_above !== "") {
    const rawThreshold = Number(input.free_above);
    if (!Number.isFinite(rawThreshold) || rawThreshold <= 0) {
      return { valid: false, error: "Free delivery threshold must be a positive number." };
    }
    if (rawThreshold > MAX_FREE_ABOVE) {
      return { valid: false, error: `Free delivery threshold cannot exceed ${MAX_FREE_ABOVE}.` };
    }
    free_above = Math.round(rawThreshold);
  }

  // 3. Courier WhatsApp phone (optional, null or valid phone number)
  let courier_whatsapp: string | null = null;
  if (typeof input.courier_whatsapp === "string" && input.courier_whatsapp.trim()) {
    const cleaned = normalizePhone(input.courier_whatsapp.trim());
    if (!isValidPhoneNumber(cleaned)) {
      return { valid: false, error: "Courier WhatsApp number must be a valid phone number." };
    }
    courier_whatsapp = cleaned;
  }

  return {
    valid: true,
    settings: {
      fee,
      free_above,
      courier_whatsapp,
    },
  };
}

/**
 * Pure server-side fee calculator.
 * - Pickup: always 0.
 * - Delivery: fee if subtotal < free_above (or free_above not set); 0 if subtotal >= free_above.
 */
export function computeOrderDeliveryFee(
  fulfilmentType: "pickup" | "delivery" | string,
  subtotal: number,
  settings: DeliverySettings
): number {
  if (fulfilmentType !== "delivery") {
    return 0;
  }

  if (settings.free_above !== null && subtotal >= settings.free_above) {
    return 0;
  }

  return settings.fee;
}
