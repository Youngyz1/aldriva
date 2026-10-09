/**
 * lib/memories/tokens.ts
 *
 * Memory (guest photo-upload) token format — Round 4.
 *
 * Memory QR tokens are event-level, NOT admission credentials:
 * - Format: `mem_` + base62 (unguessable, revocable per event via
 *   event_memory_settings).
 * - Deliberately NOT the 32-char uppercase hex admission format, so a
 *   memory QR scanned at the door 404s naturally in findTicketByCode
 *   (plus the explicit prefix check with a clear message).
 *
 * Pure module (no I/O): safe to import from client components, routes,
 * and the hermetic test suite.
 */

import { randomBytes } from "node:crypto";

export const MEMORY_TOKEN_PREFIX = "mem_";

/** 32 random bytes → 32 base62 chars. 256 bits of raw entropy. */
const TOKEN_RANDOM_BYTES = 32;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * One base62 char per byte (byte % 62). The tiny modulo bias is
 * irrelevant for an unguessable token: entropy stays 24 raw bytes
 * (~192 bits) regardless of encoding.
 */
function toBase62(bytes: Buffer): string {
  let out = "";
  for (const byte of bytes) out += BASE62[byte % 62];
  return out;
}

/** Mints a fresh event-level photo-upload token (`mem_` + 32 base62 chars). */
export function generateMemoryToken(): string {
  return `${MEMORY_TOKEN_PREFIX}${toBase62(randomBytes(TOKEN_RANDOM_BYTES))}`;
}

/** Shape check only — existence/revocation is verified server-side by row. */
export function isMemoryTokenFormat(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === MEMORY_TOKEN_PREFIX.length + 32 &&
    value.startsWith(MEMORY_TOKEN_PREFIX) &&
    /^[0-9A-Za-z]+$/.test(value.slice(MEMORY_TOKEN_PREFIX.length))
  );
}

/**
 * Admission QR format (ticket_instances.qr_code): 32-char uppercase hex.
 * Memory tokens can never collide with this alphabet by construction
 * (`mem_` prefix + lowercase letters), so door lookups miss naturally.
 */
export function isAdmissionQrFormat(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-F]{32}$/.test(value.trim());
}

/**
 * Detects a scanned memory-QR payload in the check-in scanner input.
 * The memory QR encodes the full short URL (`{site}/m/mem_…`); door staff
 * may also type/paste the bare token. Case-insensitive on purpose: the
 * verify-ticket lookup uppercases input before matching.
 */
export function isMemoryQrScan(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const upper = raw.toUpperCase();
  if (upper.includes(MEMORY_TOKEN_PREFIX.toUpperCase())) return true;
  return /\/M\//i.test(raw);
}

/** Scanner-facing rejection copy. Shared by GET + POST verify paths. */
export const MEMORY_QR_SCANNER_MESSAGE =
  "This is a photo-upload code, not an admission ticket.";
