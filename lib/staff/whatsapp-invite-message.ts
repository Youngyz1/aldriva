/**
 * lib/staff/whatsapp-invite-message.ts
 *
 * Pure WhatsApp click-to-chat URL builder for team/guest invitations.
 * Zero I/O, deterministic. No secrets or API calls involved — this only
 * builds a `https://wa.me/...` deep link for the organizer to click.
 */
import { normalizeE164Phone } from "@/lib/staff/phone";

export interface BuildInviteWhatsAppUrlInput {
  phone: string | null | undefined;
  eventTitle: string;
  acceptUrl: string;
  roleLabel?: string | null;
  /** True for an account-less staff invitation (migration 196 guest session). */
  isAccountless?: boolean;
  /** Selects the account-less extra sentence below. Defaults to "en". */
  locale?: "en" | "fr";
}

/**
 * An account-less invitation redeems to a guest session bound to the
 * browser that accepted it (migration 196). WhatsApp commonly opens links
 * in a private/in-app browser, which would silently strand that session.
 */
export const ACCOUNTLESS_BROWSER_WARNING: Record<"en" | "fr", string> = {
  en: "Open it in your normal browser, not a private window, and save the page to your home screen.",
  fr: "Ouvrez-le dans votre navigateur habituel, pas en navigation privée, et ajoutez la page à votre écran d'accueil.",
};

/**
 * Returns a `https://wa.me/<digits>?text=<encoded>` URL, or null when the
 * phone number is missing or not valid E.164.
 */
export function buildInviteWhatsAppUrl(input: BuildInviteWhatsAppUrlInput): string | null {
  const normalized = normalizeE164Phone(input.phone);
  if (!normalized) return null;

  const digits = normalized.slice(1); // wa.me takes digits only, no leading +
  let message = input.roleLabel
    ? `You've been invited as a ${input.roleLabel} for ${input.eventTitle}. Accept here: ${input.acceptUrl}`
    : `You're invited to ${input.eventTitle}. View your invitation: ${input.acceptUrl}`;

  if (input.isAccountless) {
    message += ` ${ACCOUNTLESS_BROWSER_WARNING[input.locale ?? "en"]}`;
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
