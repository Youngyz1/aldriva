// Pure normalisation for staff invitations. Mirrors the staff_invitations table
// checks (email shape, phone 7-15 digits with no "+", channel list) and the
// accept helpers (email compared lower-cased, phone compared digits-only).

export const INVITE_CHANNELS = ["email", "sms", "whatsapp", "link"] as const;
export type InviteChannel = (typeof INVITE_CHANNELS)[number];

export type InviteContact = {
  email: string | null;
  phone: string | null;
  channel: InviteChannel;
};

export type InviteContactResult =
  | { ok: true; value: InviteContact }
  | { ok: false; error: { code: string; message: string } };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fail(code: string, message: string): InviteContactResult {
  return { ok: false, error: { code, message } };
}

export function normalizeInviteEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "" ? null : v;
}

export function normalizeInvitePhone(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/[^0-9]/g, "");
  return v === "" ? null : v;
}

export function validateInviteContact(input: {
  email?: string | null;
  phone?: string | null;
  channel?: string | null;
}): InviteContactResult {
  const email = normalizeInviteEmail(input.email);
  const phone = normalizeInvitePhone(input.phone);

  if (email === null && phone === null) {
    return fail("invite_contact_required", "Enter an email address or a phone number for the invitation.");
  }
  if (email !== null && !EMAIL_RE.test(email)) {
    return fail("invite_email_invalid", "Enter a valid email address.");
  }
  if (phone !== null && (phone.length < 7 || phone.length > 15)) {
    return fail("invite_phone_invalid", "Enter a phone number with 7 to 15 digits.");
  }

  const channel = (input.channel ?? "link") as InviteChannel;
  if (!INVITE_CHANNELS.includes(channel)) {
    return fail("invite_channel_invalid", "Choose how to send the invitation.");
  }
  if (channel === "email" && email === null) {
    return fail("invite_contact_required", "Sending by email needs an email address.");
  }
  if ((channel === "sms" || channel === "whatsapp") && phone === null) {
    return fail("invite_contact_required", "Sending by phone needs a phone number.");
  }

  return { ok: true, value: { email, phone, channel } };
}
