"use client";

import { PrintedReceipt, shortReference, type ReceiptRow, type ReceiptStatus } from "../PrintedReceipt";

export type BookingReceiptProps = {
  businessName: string;
  /** Usually "Table for 2 · Fri 12 Apr, 7:30 PM". */
  subtitle?: string | null;
  logoSrc?: string | null;
  coverSrc?: string | null;
  reservationNumber: string;
  when?: string | null;
  partySize?: number | string | null;
  guestName?: string | null;
  note?: string | null;
  status?: ReceiptStatus | null;
  animate?: boolean;
  onDownload?: () => void;
  /**
   * Signed scan code from the scanner phase. The reservation number is
   * guessable and is never encoded — without a scan code the barcode is
   * hidden and only the short reference is printed.
   */
  scanCode?: string | null;
};

/**
 * Table/booking layout. No amount is assumed — reservations may be free, so
 * `total` is intentionally omitted and left to a future deposit variant.
 */
export function BookingReceipt({
  businessName,
  subtitle,
  logoSrc,
  coverSrc,
  reservationNumber,
  when,
  partySize,
  guestName,
  note,
  status,
  animate = false,
  onDownload,
  scanCode,
}: BookingReceiptProps) {
  const rows: ReceiptRow[] = [];

  if (when) rows.push({ label: "When", value: when, emphasis: true });
  if (partySize !== null && partySize !== undefined) {
    rows.push({ label: "Party", value: String(partySize) });
  }
  if (guestName) rows.push({ label: "Guest", value: guestName });

  const reference = shortReference(reservationNumber);
  if (reference) rows.push({ label: "Reservation", value: reference, mono: true });

  return (
    <PrintedReceipt
      typeLabel="Booking"
      name={businessName}
      subtitle={subtitle}
      logoSrc={logoSrc}
      coverSrc={coverSrc}
      rows={rows}
      status={status}
      code={{
        kind: "barcode",
        value: scanCode ?? "",
        caption: "Show this code when you arrive to check in.",
      }}
      reference={reservationNumber}
      note={note}
      animate={animate}
      downloadLabel="Download booking"
      onDownload={onDownload}
    />
  );
}
