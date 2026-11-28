"use client";

import { formatMoney } from "@/lib/money";
import type { RentalReceiptData } from "@/lib/rental/receipt-data";
import {
  PrintedReceipt,
  shortReference,
  type ReceiptRow,
  type ReceiptStatus,
} from "../PrintedReceipt";

export type RentalReceiptProps = {
  data: RentalReceiptData;
  animate?: boolean;
  onDownload?: () => void;
  downloadLabel?: string;
  soundDefaultEnabled?: boolean;
};

function formatUtc(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return (
    date.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}

function depositNote(data: RentalReceiptData): string {
  if (data.depositRequired > 0) {
    const status = (data.depositStatus || "none").replace(/_/g, " ");
    let note = `Security deposit ${formatMoney(data.depositRequired, data.currency)} (collected ${formatMoney(data.depositCollected ?? 0, data.currency)}, retained ${formatMoney(data.depositRetained ?? 0, data.currency)}, ${status}). Collected separately from rental payment.`;
    if (data.depositRetentionReason) note += ` Reason: ${data.depositRetentionReason}`;
    return note;
  }
  return "No security deposit is required for this booking.";
}

/**
 * Rental payment layout. The booking number is only printed as a short
 * human-readable reference — it is never encoded in a QR or barcode.
 */
export function RentalReceipt({
  data,
  animate = false,
  onDownload,
  downloadLabel = "Print receipt",
  soundDefaultEnabled = false,
}: RentalReceiptProps) {
  const paidLabel = data.paymentMethod ? "Paid" : "Paid online";
  const rows: ReceiptRow[] = [
    {
      label: "Booking",
      value: data.bookingNumber,
      mono: true,
      emphasis: true,
    },
    { label: "Customer", value: data.customerName },
    { label: "Pickup", value: formatUtc(data.startsAt) },
    { label: "Return", value: formatUtc(data.endsAt) },
    {
      label: "Rental charge",
      value: formatMoney(data.rentalAmount, data.currency),
    },
  ];
  if ((data.lateFeeAmount ?? 0) > 0 || (data.lateFeeStatus && data.lateFeeStatus !== "none")) {
    rows.push({ label: "Late fee", value: `${formatMoney(data.lateFeeAmount ?? 0, data.currency)} (${(data.lateFeeStatus || "none").replace(/_/g, " ")})` });
  }
  rows.push({ label: paidLabel, value: formatMoney(data.amountPaid, data.currency) });
  rows.push({ label: "Balance due", value: formatMoney(data.balanceDue, data.currency), emphasis: data.balanceDue > 0 });
  rows.push({ label: "Paid on", value: formatUtc(data.paidAt) });

  if (data.paymentMethod) {
    rows.push({ label: "Method", value: data.paymentMethod });
  }
  const paymentRef = shortReference(data.paymentReference);
  if (paymentRef) {
    rows.push({ label: "Payment ref", value: paymentRef, mono: true });
  }

  const status: ReceiptStatus =
    data.balanceDue <= 0
      ? { label: "Paid" }
      : { label: "Payment received" };

  return (
    <PrintedReceipt
      typeLabel="Rental receipt"
      name={data.businessName}
      rows={rows}
      total={{
        label: paidLabel,
        value: formatMoney(data.amountPaid, data.currency),
      }}
      status={status}
      code={{ kind: "none", reference: data.bookingNumber }}
      note={depositNote(data)}
      animate={animate}
      soundDefaultEnabled={soundDefaultEnabled}
      downloadLabel={downloadLabel}
      onDownload={onDownload}
    />
  );
}
