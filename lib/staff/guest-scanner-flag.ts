import "server-only";

/**
 * Guest (account-less) scanner rollout gate.
 *
 * The guest scanner page depends on the wip/event-staff-scanner verify-ticket
 * rewrite (guest cookie authentication, entrance checks, expired-session
 * semantics). Until that lands on this branch the redemption flow must not send
 * an invited guest to a scanner page that cannot check anyone in.
 *
 * Off unless EVENT_GUEST_SCANNER_ENABLED is exactly "true". Read on the server
 * only; the client learns the answer from the redeem response.
 */
export const GUEST_SCANNER_FLAG_ENV = "EVENT_GUEST_SCANNER_ENABLED";

export function isGuestScannerEnabled(): boolean {
  return process.env[GUEST_SCANNER_FLAG_ENV] === "true";
}

export const GUEST_SCANNER_UNAVAILABLE_MESSAGE =
  "Your invitation was accepted, but guest scanning is not available on this event yet. Show this message to the organizer — they can add you with an Aldriva account to scan tickets today.";
