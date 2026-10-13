/**
 * lib/order-phone.ts
 * Pure phone validation for guest order requests (no "use server").
 * Kept outside lib/actions/orders.ts so the server-action module exports
 * only async functions and types (see website-content-actions compliance test).
 */

/**
 * Validates Côte d'Ivoire and international phone numbers.
 * Supports:
 * - International formats: +1234567890 (7 to 15 digits)
 * - CI local 10-digit formats: 0701020304, 0501020304, 0101020304
 * - Formatted variants with spaces/dashes/parentheses
 */
export function isValidPhoneNumber(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return false;
  // If starts with +, ensure standard international prefix
  if (raw.trim().startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(raw.trim().replace(/[\s\-\(\)]/g, ""));
  }
  // If local digits: CI uses 10 digits (0[157]... or general 10 digits)
  return /^\d{8,15}$/.test(digitsOnly);
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-\(\)\.]/g, "").trim();
}
