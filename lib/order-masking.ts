/**
 * lib/order-masking.ts
 *
 * PII masking helpers for customer order tracking pages.
 * Ensures customer names and phone numbers are safely masked before display.
 */

export function maskCustomerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "";
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${first} ${lastInitial}.`;
}

export function maskCustomerPhone(phone: string): string {
  const clean = phone.trim();
  if (clean.length < 6) return "••••••";
  const head = clean.slice(0, Math.min(6, clean.length - 2));
  const tail = clean.slice(-2);
  return `${head} •• •• ${tail}`;
}
