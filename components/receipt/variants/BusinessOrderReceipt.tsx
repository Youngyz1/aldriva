"use client";

import {
  PrintedReceipt,
  shortReference,
  type ReceiptItem,
  type ReceiptRow,
  type ReceiptStatus,
} from "../PrintedReceipt";

export type BusinessOrderItem = ReceiptItem;

export type BusinessOrderReceiptProps = {
  businessName: string;
  /** Usually the fulfilment summary: "Delivery · 7:45 PM". */
  subtitle?: string | null;
  logoSrc?: string | null;
  coverSrc?: string | null;
  orderNumber: string;
  items?: BusinessOrderItem[];
  fulfilment?: string | null;
  payment?: string | null;
  note?: string | null;
  total?: { label: string; value: string } | null;
  status?: ReceiptStatus | null;
  animate?: boolean;
  onDownload?: () => void;
  /**
   * Signed scan code from the scanner phase. Order numbers and tracking
   * tokens are guessable and must never be encoded, so until a scan code is
   * issued the barcode is hidden and only the short reference is printed.
   */
  scanCode?: string | null;
};

/**
 * Business order layout. Line items are printed as receipt items; the order
 * reference is shortened to its last 8 characters.
 */
export function BusinessOrderReceipt({
  businessName,
  subtitle,
  logoSrc,
  coverSrc,
  orderNumber,
  items = [],
  fulfilment,
  payment,
  note,
  total,
  status,
  animate = false,
  onDownload,
  scanCode,
}: BusinessOrderReceiptProps) {
  const rows: ReceiptRow[] = [];

  if (fulfilment) rows.push({ label: "Fulfilment", value: fulfilment });
  if (payment) rows.push({ label: "Payment", value: payment });

  const order = shortReference(orderNumber);
  if (order) rows.push({ label: "Order", value: order, mono: true, emphasis: true });

  return (
    <PrintedReceipt
      typeLabel="Order"
      name={businessName}
      subtitle={subtitle}
      logoSrc={logoSrc}
      coverSrc={coverSrc}
      items={items}
      rows={rows}
      total={total}
      status={status}
      code={{
        kind: "barcode",
        value: scanCode ?? "",
        caption: "Show this code at the counter to collect your order.",
      }}
      reference={orderNumber}
      note={note}
      animate={animate}
      onDownload={onDownload}
    />
  );
}
