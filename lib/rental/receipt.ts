import "server-only";
import { jsPDF } from "jspdf";
import { BRAND } from "@/config/branding";
import { formatMoney } from "@/lib/money";
import type { RentalReceiptData } from "@/lib/rental/receipt-data";

const PAGE_WIDTH_MM = 80;
const PAGE_HEIGHT_MM = 200;
const MARGIN_MM = 6;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;

/** Aldriva brand orange: --brand-700 / #c2410c. */
const BRAND_ORANGE: [number, number, number] = [194, 65, 12];
const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [95, 94, 90];
const RULE: [number, number, number] = [201, 199, 191];

function utc(iso: string | null): string {
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

/** Last 8 alphanumeric characters, matching the on-screen receipt. */
function shortReference(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[^a-zA-Z0-9]/g, "");
  return compact ? compact.slice(-8).toUpperCase() : null;
}

/**
 * 80 mm thermal-style PDF receipt. This is the downloadable fallback for the
 * on-screen printer receipt; both read the same `RentalReceiptData` helper so
 * their rows can never disagree.
 */
export function generateRentalReceiptPdf(d: RentalReceiptData): Buffer {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM],
  });

  const money = (amount: number) => formatMoney(amount, d.currency);
  let y = 10;

  // Brand strip + header.
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, PAGE_WIDTH_MM, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(BRAND.name.toUpperCase(), MARGIN_MM, y);

  y += 7;
  doc.setTextColor(...INK);
  doc.setFontSize(15);
  doc.text("Rental receipt", MARGIN_MM, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const businessLines = doc.splitTextToSize(d.businessName, CONTENT_WIDTH_MM);
  doc.text(businessLines, MARGIN_MM, y);
  y += businessLines.length * 3.8 + 3;

  // Status tag and booking reference.
  const status = d.balanceDue <= 0 ? "PAID" : "PAYMENT RECEIVED";
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN_MM, y, 28, 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...INK);
  doc.text(status, MARGIN_MM + 2, y + 3.4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`#${d.bookingNumber}`, PAGE_WIDTH_MM - MARGIN_MM, y + 3.4, {
    align: "right",
  });

  y += 8;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  y += 5;

  const rows: Array<[string, string, boolean?]> = [
    ["Booking", d.bookingNumber, true],
    ["Customer", d.customerName],
    ["Pickup", utc(d.startsAt)],
    ["Return", utc(d.endsAt)],
    ["Rental charge", money(d.rentalAmount)],
  ];
  if ((d.lateFeeAmount ?? 0) > 0 || (d.lateFeeStatus && d.lateFeeStatus !== "none")) {
    rows.push(["Late fee", `${money(d.lateFeeAmount ?? 0)} (${(d.lateFeeStatus || "none").replace(/_/g, " ")})`]);
  }
  rows.push(["Paid online", money(d.amountPaid), true]);
  rows.push(["Balance due", money(d.balanceDue), d.balanceDue > 0]);
  rows.push(["Paid on", utc(d.paidAt)]);

  const paymentRef = shortReference(d.paymentReference);
  if (paymentRef) rows.push(["Payment ref", paymentRef]);

  for (const [label, value, emphasis] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), MARGIN_MM, y);
    y += 3.2;

    doc.setFont("helvetica", emphasis ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(value, CONTENT_WIDTH_MM);
    doc.text(lines, MARGIN_MM, y);
    y += lines.length * 4.1 + 2.2;
  }

  // Total.
  y += 1;
  doc.setDrawColor(...INK);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text("PAID ONLINE", MARGIN_MM, y);
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(money(d.amountPaid), PAGE_WIDTH_MM - MARGIN_MM, y, {
    align: "right",
  });

  // Deposit note.
  y += 8;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  let depositNote = "No security deposit is required for this booking.";
  if (d.depositRequired > 0) {
    const status = (d.depositStatus || "none").replace(/_/g, " ");
    depositNote = `Security deposit ${money(d.depositRequired)} (collected ${money(d.depositCollected ?? 0)}, retained ${money(d.depositRetained ?? 0)}, ${status}). Collected separately from rental payment.`;
    if (d.depositRetentionReason) depositNote += ` Reason: ${d.depositRetentionReason}`;
  }
  doc.text(doc.splitTextToSize(depositNote, CONTENT_WIDTH_MM), MARGIN_MM, y);
  y += doc.splitTextToSize(depositNote, CONTENT_WIDTH_MM).length * 3 + 5;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("Thank you for your booking.", MARGIN_MM, y);
  y += 3.5;
  doc.text(
    `Questions? ${BRAND.supportEmail}`,
    MARGIN_MM,
    y,
    { maxWidth: CONTENT_WIDTH_MM }
  );
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text(`POWERED BY ${BRAND.name.toUpperCase()}`, PAGE_WIDTH_MM / 2, y, {
    align: "center",
  });

  return Buffer.from(doc.output("arraybuffer"));
}
