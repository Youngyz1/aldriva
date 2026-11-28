"use client";

import {
  PrintedReceipt,
  shortReference,
  type ReceiptRow,
  type ReceiptStatus,
} from "../PrintedReceipt";

export type DonationReceiptProps = {
  campaignName: string;
  /** Usually "Donation to <campaign>" or the fundraiser subtitle. */
  subtitle?: string | null;
  logoSrc?: string | null;
  coverSrc?: string | null;
  /** Pre-formatted amount, e.g. "USD 250.00". */
  amount: string;
  donorName?: string | null;
  donatedAt?: string | null;
  reference?: string | null;
  nonprofit?: boolean;
  note?: string | null;
  /** Overrides the standard thank-you line in the code area. */
  thankYou?: string | null;
  status?: ReceiptStatus | null;
  animate?: boolean;
  onDownload?: () => void;
};

function formatDonated(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Donation layout. No code area: a donation is never scanned, so the bottom
 * of the paper carries a thank-you line and the short reference instead.
 * Tax wording lives in `note` so the component stays presentational.
 */
export function DonationReceipt({
  campaignName,
  subtitle,
  logoSrc,
  coverSrc,
  amount,
  donorName,
  donatedAt,
  reference,
  nonprofit = false,
  note,
  thankYou,
  status,
  animate = false,
  onDownload,
}: DonationReceiptProps) {
  const rows: ReceiptRow[] = [];

  if (donorName) rows.push({ label: "Donor", value: donorName });

  const donated = formatDonated(donatedAt);
  if (donated) rows.push({ label: "Date", value: donated });

  rows.push({
    label: "Type",
    value: nonprofit ? "Tax-deductible" : "Standard donation",
  });

  return (
    <PrintedReceipt
      typeLabel="Donation"
      name={campaignName}
      subtitle={subtitle}
      logoSrc={logoSrc}
      coverSrc={coverSrc}
      rows={rows}
      total={{ label: "Amount donated", value: amount }}
      status={status}
      code={{
        kind: "none",
        note: thankYou ?? "Thank you for your generous donation.",
        reference: reference ? (shortReference(reference) ?? reference) : null,
      }}
      note={note}
      animate={animate}
      downloadLabel="Download receipt"
      onDownload={onDownload}
    />
  );
}
