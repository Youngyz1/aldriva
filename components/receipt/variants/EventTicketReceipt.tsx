"use client";

import { PrintedReceipt, shortReference, type ReceiptRow, type ReceiptStatus } from "../PrintedReceipt";

export type EventTicketReceiptProps = {
  eventName: string;
  /** Usually "Sat, 12 Apr · Venue, City". */
  eventSubtitle?: string | null;
  qrCode: string;
  logoSrc?: string | null;
  coverSrc?: string | null;
  tierName?: string | null;
  seatLabel?: string | null;
  attendeeName?: string | null;
  orderReference?: string | null;
  issuedAt?: string | null;
  total?: { label: string; value: string } | null;
  status?: ReceiptStatus | null;
  note?: string | null;
  animate?: boolean;
  onDownload?: () => void;
  /** Omit the QR, e.g. when another element on the page already shows it. */
  hideCode?: boolean;
};

function formatIssued(issuedAt?: string | null): string | null {
  const date = issuedAt ? new Date(issuedAt) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Event ticket layout. Keeps the event's own pass content (tier, seat,
 * attendee, order reference) and the existing QR contract — the raw ticket
 * code is passed straight through to `ReceiptQr`.
 */
export function EventTicketReceipt({
  eventName,
  eventSubtitle,
  qrCode,
  logoSrc,
  coverSrc,
  tierName,
  seatLabel,
  attendeeName,
  orderReference,
  issuedAt,
  total,
  status,
  note,
  animate = false,
  onDownload,
  hideCode = false,
}: EventTicketReceiptProps) {
  const rows: ReceiptRow[] = [];

  if (tierName) rows.push({ label: "Ticket", value: tierName, emphasis: true });
  if (seatLabel) rows.push({ label: "Seat", value: seatLabel });

  const order = shortReference(orderReference);
  if (order) rows.push({ label: "Order", value: order, mono: true });

  if (attendeeName) rows.push({ label: "Attendee", value: attendeeName });

  const issued = formatIssued(issuedAt);
  if (issued) rows.push({ label: "Issued", value: issued });

  return (
    <PrintedReceipt
      typeLabel="Event ticket"
      name={eventName}
      subtitle={eventSubtitle}
      logoSrc={logoSrc}
      coverSrc={coverSrc}
      rows={rows}
      total={total}
      status={status}
      code={hideCode ? { kind: "none" } : { kind: "qr", value: qrCode }}
      note={note}
      animate={animate}
      downloadLabel="Download"
      onDownload={onDownload}
    />
  );
}
