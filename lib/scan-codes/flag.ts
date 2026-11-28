import "server-only";

/**
 * Scan code registry rollout gate (Phase 2 — issuance only, no scan action).
 * Off unless SCAN_CODES_ENABLED is exactly "true". Read on the server only.
 */
export const SCAN_CODES_FLAG_ENV = "SCAN_CODES_ENABLED";

export function isScanCodesEnabled(): boolean {
  return process.env[SCAN_CODES_FLAG_ENV] === "true";
}
