/**
 * lib/uuid.ts
 *
 * A cross-environment UUID v4 generator with a three-tier fallback strategy:
 *
 *   1. crypto.randomUUID()       – spec-compliant, available in secure contexts
 *                                  (HTTPS, localhost) in all modern browsers and
 *                                  in Node.js ≥ 14.17 / 19.
 *
 *   2. crypto.getRandomValues()  – available in all modern browsers (even over
 *                                  plain HTTP on a LAN IP), and in Node.js ≥ 15
 *                                  via the Web Crypto API.  We use it to fill a
 *                                  16-byte Uint8Array and format a RFC 4122 v4
 *                                  UUID manually.
 *
 *   3. Math.random()             – last-resort fallback for very old browsers or
 *                                  environments without any Web Crypto support.
 *                                  Sufficient for idempotency keys (uniqueness
 *                                  within a session), but NOT cryptographically
 *                                  secure — do not use for anything security-
 *                                  sensitive.
 *
 * WHY NOT INLINE crypto.randomUUID() IN THE CALL SITE
 * ─────────────────────────────────────────────────────
 * `crypto.randomUUID()` is only available in *secure contexts* (HTTPS or
 * localhost).  Accessing the donate page over a LAN IP (e.g. http://192.168.x.x)
 * during development causes `crypto.randomUUID is not a function`, crashing the
 * checkout flow.  This helper smoothly degrades without affecting the happy path.
 */

/**
 * Returns a RFC 4122 version 4 UUID string.
 *
 * The result is suitable for use as a Stripe idempotency key or any other
 * nonce that needs to be unique within a session.  Tier 3 (Math.random) is not
 * cryptographically strong — for security-sensitive tokens always ensure a
 * secure context is available.
 */
export function generateUUID(): string {
  // ── Tier 1: crypto.randomUUID() ────────────────────────────────────────────
  // Fastest path; only available in secure contexts.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // ── Tier 2: crypto.getRandomValues() ───────────────────────────────────────
  // Available over plain HTTP in modern browsers.  We fill 16 bytes of
  // cryptographically random data and format them as a v4 UUID per RFC 4122.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set the version bits (v4): bits 12–15 of byte 6 → 0100
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set the variant bits: bits 6–7 of byte 8 → 10
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    // Format as xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return [
      bytes.slice(0, 4),
      bytes.slice(4, 6),
      bytes.slice(6, 8),
      bytes.slice(8, 10),
      bytes.slice(10, 16),
    ]
      .map((seg) =>
        Array.from(seg)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      )
      .join("-");
  }

  // ── Tier 3: Math.random() ──────────────────────────────────────────────────
  // Fallback for environments with no Web Crypto support at all.
  // NOT cryptographically secure — acceptable for idempotency keys only.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
