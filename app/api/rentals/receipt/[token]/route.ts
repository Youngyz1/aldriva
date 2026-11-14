import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateRentalReceiptPdf } from "@/lib/rental/receipt";
import { getRentalReceiptData } from "@/lib/rental/receipt-data";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The secret lookup token is the only credential. A receipt exists as soon as
// any online payment is applied (including an advance), not only when the
// booking's payment_status has reached "paid".
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!UUID.test(token)) {
    return NextResponse.json({ error: "Invalid receipt link." }, { status: 400 });
  }

  const limited = await enforceRateLimit("guestLookup", request);
  if (limited) return limited;

  const data = await getRentalReceiptData(token);
  if (!data) {
    return NextResponse.json(
      { error: "Receipt not available." },
      { status: 404 }
    );
  }

  try {
    const pdf = generateRentalReceiptPdf(data);
    const filename =
      "rental_receipt_" +
      data.bookingNumber.replace(/[^a-zA-Z0-9_-]/g, "_") +
      ".pdf";
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename=${filename}`);
    return new NextResponse(new Uint8Array(pdf), { status: 200, headers });
  } catch (err) {
    console.error("[rental-receipt] PDF generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate receipt." },
      { status: 500 }
    );
  }
}
