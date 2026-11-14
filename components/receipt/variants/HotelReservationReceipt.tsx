"use client";

import { PrintedReceipt, shortReference, type ReceiptRow, type ReceiptStatus } from "../PrintedReceipt";

export type HotelReservationReceiptProps = {
  hotelName: string;
  /** Usually the room type or rate plan. */
  subtitle?: string | null;
  logoSrc?: string | null;
  coverSrc?: string | null;
  reservationNumber: string;
  checkIn?: string | null;
  checkOut?: string | null;
  roomType?: string | null;
  guests?: number | string | null;
  note?: string | null;
  total?: { label: string; value: string } | null;
  status?: ReceiptStatus | null;
  animate?: boolean;
  onDownload?: () => void;
  /** Signed scan code from the scanner phase; never the reservation number. */
  scanCode?: string | null;
};

/**
 * Hotel stay layout. Check-in/out are passed in already formatted by the
 * caller so timezone handling stays with the booking data, not the receipt.
 */
export function HotelReservationReceipt({
  hotelName,
  subtitle,
  logoSrc,
  coverSrc,
  reservationNumber,
  checkIn,
  checkOut,
  roomType,
  guests,
  note,
  total,
  status,
  animate = false,
  onDownload,
  scanCode,
}: HotelReservationReceiptProps) {
  const rows: ReceiptRow[] = [];

  if (checkIn) rows.push({ label: "Check-in", value: checkIn, emphasis: true });
  if (checkOut) rows.push({ label: "Check-out", value: checkOut });
  if (roomType) rows.push({ label: "Room", value: roomType });
  if (guests !== null && guests !== undefined) {
    rows.push({ label: "Guests", value: String(guests) });
  }

  const reference = shortReference(reservationNumber);
  if (reference) rows.push({ label: "Reservation", value: reference, mono: true });

  return (
    <PrintedReceipt
      typeLabel="Hotel reservation"
      name={hotelName}
      subtitle={subtitle}
      logoSrc={logoSrc}
      coverSrc={coverSrc}
      rows={rows}
      total={total}
      status={status}
      code={{
        kind: "barcode",
        value: scanCode ?? "",
        caption: "Show this code at reception to check in.",
      }}
      reference={reservationNumber}
      note={note}
      animate={animate}
      downloadLabel="Download reservation"
      onDownload={onDownload}
    />
  );
}
