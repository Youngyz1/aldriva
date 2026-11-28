import "server-only";

/**
 * Scan actions rollout gate (Phase 3 — scan actions for orders/reservations).
 * Off unless SCAN_ACTIONS_ENABLED is exactly "true". Read on the server only.
 */
export const SCAN_ACTIONS_FLAG_ENV = "SCAN_ACTIONS_ENABLED";

export function isScanActionsEnabled(): boolean {
  return process.env[SCAN_ACTIONS_FLAG_ENV] === "true";
}
