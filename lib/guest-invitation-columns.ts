export const LEGACY_GUEST_INVITATION_SELECT =
  "id, event_id, guest_name, guest_title, organization, email, phone, invitation_status, rsvp_status, rsvp_at, notes, created_at, updated_at";

export const OPTIONAL_GUEST_INVITATION_COLUMNS = [
  "guest_allowance",
  "rsvp_guest_count",
  "rsvp_guest_names",
  "rsvp_message",
] as const;

export const GUEST_INVITATION_SELECT_WITH_OPTIONAL =
  `${LEGACY_GUEST_INVITATION_SELECT}, ${OPTIONAL_GUEST_INVITATION_COLUMNS.join(", ")}`;

export function isMissingGuestInvitationColumnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const description = [candidate.message, candidate.details, candidate.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  if (code !== "42703" && code !== "PGRST204") return false;
  return OPTIONAL_GUEST_INVITATION_COLUMNS.some((column) => description.includes(column));
}

export function withEmptyGuestInvitationColumns<T extends object>(row: T) {
  return {
    guest_allowance: null,
    rsvp_guest_count: null,
    rsvp_guest_names: null,
    rsvp_message: null,
    ...row,
  };
}

export class GuestInvitationColumnsUnavailableError extends Error {
  constructor() {
    super("Guest allowance and RSVP details require migration 188. Apply it, then retry.");
    this.name = "GuestInvitationColumnsUnavailableError";
  }
}
