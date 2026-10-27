/** Return a normalized E.164 number, or null when input is not a phone number. */
export function normalizeE164Phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9][0-9]{1,14}$/.test(normalized) ? normalized : null;
}
