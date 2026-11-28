import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyAuth } from "@/lib/rental/auth";
import { getRentalReceiptDataForStaff } from "@/lib/rental/receipt-data";
import { checkRateLimit } from "@/lib/rate-limit";

const RECEIPT_PAPER_WIDTH = "80mm";

function htmlEscape(s: string): string {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) result += "&"; // &
    else if (c === 60) result += "<"; // <
    else if (c === 62) result += ">"; // >
    else if (c === 34) result += '"'; // "
    else if (c === 39) result += "'"; // '
    else if (c === 47) result += "&#x2F;"; // /
    else result += c;
  }
  return result;
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  // UUID validation
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID.test(token)) {
    return new Response("Invalid token", { status: 404 });
  }

  // Rate limit by IP
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0]?.trim() : null) || "unknown";
    const rl = await checkRateLimit("rentalQuoteIp", `ip:${ip}`);
    if (!rl.allowed) {
      return new Response("Rate limited", { status: 429 });
    }
  } catch {
    // Non-fatal: proceed if headers() is unavailable
  }

  // Auth check - staff only: find the booking and verify organizer access
  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("rental_bookings")
    .select("id, organizer_id")
    .eq("lookup_token", token)
    .maybeSingle();

  if (!booking) {
    return new Response("Booking not found", { status: 404 });
  }

  try {
    await verifyAuth(booking.organizer_id, ["owner", "admin", "manager", "editor"]);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const receiptData = await getRentalReceiptDataForStaff(
    booking.id,
    booking.organizer_id
  );
  if (!receiptData) {
    return new Response("Booking not found or no payments", { status: 404 });
  }

  const bn = htmlEscape(receiptData.bookingNumber);
  const cn = htmlEscape(receiptData.customerName);
  const st = htmlEscape(receiptData.startsAt);
  const en = htmlEscape(receiptData.endsAt);
  const ra = receiptData.rentalAmount.toString();
  const pa = receiptData.amountPaid.toString();
  const bd = receiptData.balanceDue.toString();
  const pa2 = receiptData.paidAt ? htmlEscape(receiptData.paidAt) : "—";
  const dr = receiptData.depositRequired > 0 ? receiptData.depositRequired.toString() : "";
  const cu = htmlEscape(receiptData.currency);
  const pm = receiptData.paymentMethod ? htmlEscape(receiptData.paymentMethod) : "";
  const ps = htmlEscape(receiptData.paymentStatus);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rental Receipt #${bn} - Staff</title>
  <style>
    @page {
      size: ${RECEIPT_PAPER_WIDTH} auto;
      margin: 0;
    }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    .receipt {
      max-width: ${RECEIPT_PAPER_WIDTH};
      margin: 0 auto;
      padding: 1rem;
      box-sizing: border-box;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid #dee2e6;
      padding-bottom: 0.5rem;
    }
    .row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .label {
      font-size: 0.7rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .value {
      font-size: 1rem;
      font-weight: bold;
    }
    .booking-number {
      font-size: 1.2rem;
      font-weight: bold;
      margin-bottom: 1rem;
    }
    .deposit-note {
      font-size: 0.75rem;
      color: #555;
      margin-top: 1rem;
    }
    .paid-note {
      font-size: 0.7rem;
      color: #4a4a4a;
      margin-top: 1rem;
    }
    .method {
      font-size: 0.75rem;
      color: #666;
    }
    .powered {
      font-size: 0.6rem;
      color: #999;
      text-align: center;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="booking-number">Booking #${bn}</div>

    <div class="row">
      <span class="label">Customer</span>
      <span class="value">${cn}</span>
    </div>

    <div class="row">
      <span class="label">Pickup</span>
      <span class="value">${st}</span>
    </div>

    <div class="row">
      <span class="label">Return</span>
      <span class="value">${en}</span>
    </div>

    <div class="row">
      <span class="label">Rental Charge</span>
      <span class="value">${ra} ${cu}</span>
    </div>

    <div class="row">
      <span class="label">Amount Paid</span>
      <span class="value">${pa} ${cu}</span>
    </div>

    <div class="row">
      <span class="label">Balance Due</span>
      <span class="value">${bd} ${cu}</span>
    </div>

    <div class="row">
      <span class="label">Paid On</span>
      <span class="value">${pa2}</span>
    </div>

    ${pm ? `<div class="method">Method: ${pm}</div>` : ""}

    ${dr ? `<div class="deposit-note">A security deposit of ${cu} ${dr} is collected separately at pickup and is not part of this payment.</div>` : ""}

    ${ps === "refunded" ? `<div class="paid-note">This receipt reflects a refunded payment.</div>` : ""}

    <div class="powered">Powered by Aldriva</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}