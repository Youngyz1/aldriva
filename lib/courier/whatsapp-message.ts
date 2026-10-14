/**
 * lib/courier/whatsapp-message.ts
 *
 * Pure WhatsApp message builder for owner-managed courier pickup requests.
 * Zero I/O, deterministic, strict parameter encoding.
 *
 * Safe privacy contract:
 * - Omits internal database UUIDs and provider payment secrets.
 * - Omits customer tracking token (only customer should track their order).
 * - Shares customer first name + phone + delivery address with the courier (required for delivery).
 */

import { formatCurrency } from "@/lib/format-locale";
import type { Locale } from "@/i18n/routing";

export interface BuildCourierMessageInput {
  orderNumber: string;
  businessName: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryNote?: string | null;
  itemsCount: number;
  currency: string;
  totalAmount: number;
  deliveryFee: number;
  isPaid: boolean;
  promisedTime?: string | null;
  locale?: string;
}

const MAX_MESSAGE_LENGTH = 900;
const MAX_NOTE_LENGTH = 120;

/**
 * Builds plain text courier dispatch message in EN or FR.
 */
export function buildCourierMessage(input: BuildCourierMessageInput): string {
  const isFr = input.locale === "fr";
  const firstName = input.customerName.trim().split(/\s+/)[0] || input.customerName.trim();
  const currency = input.currency || "XOF";
  const locale: Locale = isFr ? "fr" : "en";

  // Payment label: If unpaid, courier must collect the total amount; if paid, courier collects 0.
  const amountToCollect = input.isPaid
    ? (isFr ? "Déjà payé en ligne (0 FCFA à encaisser)" : "Already paid online (0 to collect)")
    : (isFr
        ? `À encaisser: ${formatCurrency(input.totalAmount, currency, locale)}`
        : `Amount to collect: ${formatCurrency(input.totalAmount, currency, locale)}`);

  const deliveryFeeFormatted = formatCurrency(input.deliveryFee, currency, locale);

  const lines: string[] = [];

  // Header
  lines.push(
    isFr
      ? `📦 DEMANDE DE COURSIER — COMMANDE #${input.orderNumber}`
      : `📦 COURIER REQUEST — ORDER #${input.orderNumber}`
  );

  // Pickup (Restaurant)
  if (input.businessAddress && input.businessAddress.trim()) {
    lines.push(
      isFr
        ? `📍 Récupération: ${input.businessName} (${input.businessAddress.trim()})`
        : `📍 Pickup: ${input.businessName} (${input.businessAddress.trim()})`
    );
  } else {
    lines.push(
      isFr
        ? `📍 Récupération: ${input.businessName}`
        : `📍 Pickup: ${input.businessName}`
    );
  }

  if (input.businessPhone && input.businessPhone.trim()) {
    lines.push(
      isFr
        ? `   Tél restaurant: ${input.businessPhone.trim()}`
        : `   Store phone: ${input.businessPhone.trim()}`
    );
  }

  // Drop-off (Customer)
  lines.push(
    isFr
      ? `🎯 Livraison: ${input.deliveryAddress.trim()}`
      : `🎯 Drop-off: ${input.deliveryAddress.trim()}`
  );

  if (input.deliveryNote && input.deliveryNote.trim()) {
    const truncatedNote = input.deliveryNote.trim().slice(0, MAX_NOTE_LENGTH);
    lines.push(
      isFr
        ? `   Note adresse: ${truncatedNote}`
        : `   Address note: ${truncatedNote}`
    );
  }

  // Customer Contact (first name + phone)
  lines.push(
    isFr
      ? `👤 Client: ${firstName} (${input.customerPhone.trim()})`
      : `👤 Customer: ${firstName} (${input.customerPhone.trim()})`
  );

  // Package info
  lines.push(
    isFr
      ? `📋 Colis: ${input.itemsCount} article${input.itemsCount > 1 ? "s" : ""}`
      : `📋 Package: ${input.itemsCount} item${input.itemsCount > 1 ? "s" : ""}`
  );

  // Financials
  lines.push(`💰 ${amountToCollect}`);
  lines.push(
    isFr
      ? `🛵 Frais de livraison: ${deliveryFeeFormatted}`
      : `🛵 Delivery fee: ${deliveryFeeFormatted}`
  );

  // Promised ready time
  if (input.promisedTime) {
    lines.push(
      isFr
        ? `⏰ Prêt pour: ${input.promisedTime}`
        : `⏰ Ready at: ${input.promisedTime}`
    );
  }

  const rawMessage = lines.join("\n");
  if (rawMessage.length <= MAX_MESSAGE_LENGTH) {
    return rawMessage;
  }
  return rawMessage.slice(0, MAX_MESSAGE_LENGTH - 3) + "...";
}

/**
 * Builds direct WhatsApp URL.
 * If courierWhatsapp is given: https://wa.me/<number>?text=<encoded>
 * If courierWhatsapp is null/empty: https://wa.me/?text=<encoded> (allows contact picking)
 */
export function buildCourierWhatsAppUrl(
  input: BuildCourierMessageInput,
  courierWhatsapp?: string | null
): string {
  const message = buildCourierMessage(input);
  const encodedText = encodeURIComponent(message);

  if (courierWhatsapp && courierWhatsapp.trim()) {
    // Strip non-digits except initial + if present
    const cleanNumber = courierWhatsapp.replace(/[^\d]/g, "");
    if (cleanNumber.length >= 8) {
      return `https://wa.me/${cleanNumber}?text=${encodedText}`;
    }
  }

  return `https://wa.me/?text=${encodedText}`;
}
