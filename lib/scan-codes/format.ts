/**
 * Pure format/classification helpers for the scan code registry (Phase 2).
 *
 * A bare 32-hex string is always a ticket QR; it must never be reclassified
 * by anything added here. Scan codes for orders/reservations are typed and
 * prefixed (O1-/R1-) specifically so the two families can never collide.
 */

export const SCAN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const TICKET_CODE_RE = /^[0-9A-F]{32}$/;
export const ORDER_SCAN_CODE_RE = /^O1-[0-9A-HJKMNP-TV-Z]{16}$/;
export const RESERVATION_SCAN_CODE_RE = /^R1-[0-9A-HJKMNP-TV-Z]{16}$/;

export const MAX_SCANNED_PAYLOAD_LENGTH = 128;

export type ScanPayloadKind = "ticket" | "order" | "reservation" | "unknown";

/**
 * Normalizes a raw scanned string (from a camera decode or manual entry)
 * before classification: trims, unwraps a URL down to its last non-empty
 * path segment (dropping query/hash), strips trailing slashes, and
 * uppercases. Returns "" for anything over MAX_SCANNED_PAYLOAD_LENGTH so
 * the caller treats it as unknown rather than matching it against a regex.
 */
export function normalizeScannedPayload(raw: string): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (value.length === 0 || value.length > MAX_SCANNED_PAYLOAD_LENGTH) return "";

  if (/^https?:\/\//i.test(value)) {
    const withoutHash = value.split("#")[0];
    const withoutQuery = withoutHash.split("?")[0];
    const trimmedSlashes = withoutQuery.replace(/\/+$/, "");
    const segments = trimmedSlashes.split("/").filter((segment) => segment.length > 0);
    value = segments.length > 0 ? segments[segments.length - 1] : "";
  } else {
    value = value.replace(/\/+$/, "");
  }

  value = value.toUpperCase();
  return value.length > 0 && value.length <= MAX_SCANNED_PAYLOAD_LENGTH ? value : "";
}

/**
 * Classifies an already-normalized (or raw) scanned payload. Ticket, order,
 * and reservation patterns are mutually exclusive by construction: the
 * ticket pattern is 32 hex characters with no separator, while O1-/R1- codes
 * always carry the dash-delimited prefix and a Crockford-base32 body that
 * excludes the letters this hex pattern would require (no non-hex letters
 * appear in TICKET_CODE_RE, and O1-/R1- never has length 32).
 */
export function classifyScanPayload(raw: string): ScanPayloadKind {
  const normalized = normalizeScannedPayload(raw);
  if (!normalized) return "unknown";
  if (TICKET_CODE_RE.test(normalized)) return "ticket";
  if (ORDER_SCAN_CODE_RE.test(normalized)) return "order";
  if (RESERVATION_SCAN_CODE_RE.test(normalized)) return "reservation";
  return "unknown";
}
