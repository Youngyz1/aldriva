export type CookInvitationState = "not_invited" | "invited" | "expired" | "accepted" | "revoked";

/** Keep the human-entered formatting for display/storage, but validate digits. */
export function normalizePhoneDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^0-9]/g, "") : "";
}

/** Accept common international phone formatting and require 4–20 digits. */
export function isValidWorkerPhone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length <= 32 && /^\+?[0-9().\s-]+$/.test(trimmed) && /^[0-9]{4,20}$/.test(normalizePhoneDigits(trimmed));
}

export function getCookInvitationState(
  invitation: {
    expires_at?: string | null;
    token_consumed_at?: string | null;
    accepted_at?: string | null;
    revoked_at?: string | null;
  } | null | undefined,
  now = new Date()
): CookInvitationState {
  if (!invitation) return "not_invited";
  if (invitation.revoked_at) return "revoked";
  if (invitation.accepted_at || invitation.token_consumed_at) return "accepted";
  if (!invitation.expires_at || new Date(invitation.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return "invited";
}

/** Kitchen routes are private: never bootstrap third-party analytics there. */
export function isKitchenPrivatePath(pathname: string | null | undefined): boolean {
  const withoutLocale = (pathname ?? "").replace(/^\/(?:en|fr)(?=\/|$)/, "");
  return /^\/(?:api\/)?kitchen(?:\/|$)/.test(withoutLocale);
}
