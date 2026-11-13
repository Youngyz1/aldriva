import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyAuth, WRITE_ROLES } from "@/lib/rental/auth";


/**
 * Server-only receipt data for a rental booking.
 *
 * The secret lookup token is the only credential. This module deliberately
 * returns a small, presentation-ready projection: it never exposes the
 * lookup token, driver licence/DOB, vehicle ids or other internal identifiers.
 */
export type RentalReceiptData = {
  bookingNumber: string;
  businessName: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  currency: string;
  rentalAmount: number;
  /** Amount paid (for public receipt = online only; for staff = all applied payments). */
  amountPaid: number;
  /** Remaining rental balance after every applied payment method. */
  balanceDue: number;
  paidAt: string | null;
  depositRequired: number;
  /** Stripe PaymentIntent reference, when one exists. */
  paymentReference: string | null;
  paymentStatus: string;
  /** Payment method label for staff receipts (e.g., "Cash", "Card terminal", "Mobile money"). */
  paymentMethod?: string | null;
  /** Optional scan code (K1-) if issued; never derived from booking_number or lookup_token. */
  scanCode?: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREDIT_KINDS = new Set(["rental_charge", "advance", "balance"]);

type PaymentRow = {
  amount: number | string | null;
  kind: string;
  method: string;
  direction: string;
  applied: boolean;
  created_at: string;
  stripe_payment_intent_id: string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(rows: PaymentRow[]): number {
  return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
}

function newestFirst(a: PaymentRow, b: PaymentRow): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export async function getRentalReceiptData(
  lookupToken: string
): Promise<RentalReceiptData | null> {
  if (!UUID.test(lookupToken)) return null;

  const admin = createSupabaseAdmin();
  const { data: booking, error: bookingError } = await admin
    .from("rental_bookings")
    .select(
      "id, business_id, booking_number, customer_name, starts_at, ends_at, snapshot_currency, rental_amount, deposit_required_amount, payment_status"
    )
    .eq("lookup_token", lookupToken)
    .maybeSingle();

  if (bookingError || !booking) return null;

  const { data: paymentRows, error: paymentError } = await admin
    .from("rental_payments")
    .select(
      "amount, kind, method, direction, applied, created_at, stripe_payment_intent_id"
    )
    .eq("booking_id", booking.id);

  if (paymentError) return null;

  const rows = (paymentRows ?? []) as PaymentRow[];
  const credits = rows.filter(
    (row) =>
      row.applied &&
      row.direction === "credit" &&
      CREDIT_KINDS.has(row.kind)
  );
  const refunds = rows.filter(
    (row) => row.applied && row.direction === "debit" && row.kind === "refund"
  );

  // "Paid online" is card money only. Cash/offline payments remain visible in
  // balanceDue (below) so the status chip reflects true settlement.
  const onlineCredits = credits.filter((row) => row.method === "stripe");
  const onlineRefunds = refunds.filter((row) => row.method === "stripe");
  const amountPaid = roundMoney(sum(onlineCredits) - sum(onlineRefunds));
  if (amountPaid <= 0) return null;

  const netPaid = roundMoney(sum(credits) - sum(refunds));
  const rentalAmount = Number(booking.rental_amount) || 0;
  const balanceDue = roundMoney(Math.max(0, rentalAmount - netPaid));

  const latestOnline = [...onlineCredits].sort(newestFirst)[0] ?? null;
  const latestWithReference =
    [...onlineCredits]
      .filter((row) => Boolean(row.stripe_payment_intent_id))
      .sort(newestFirst)[0] ?? null;

  const { data: business } = await admin
    .from("businesses")
    .select("name")
    .eq("id", booking.business_id)
    .maybeSingle();

  let scanCode: string | null = null;
  try {
    const { data: sc } = await admin
      .from("scan_codes")
      .select("code")
      .eq("rental_booking_id", booking.id)
      .eq("status", "active")
      .maybeSingle();
    if (sc?.code) scanCode = sc.code;
  } catch {}

  return {
    bookingNumber: String(booking.booking_number),
    businessName: String(
      (business as { name?: string | null } | null)?.name || "Rental host"
    ),
    customerName: String(booking.customer_name),
    startsAt: String(booking.starts_at),
    endsAt: String(booking.ends_at),
    currency: String(booking.snapshot_currency ?? "USD").toUpperCase(),
    rentalAmount,
    amountPaid,
    balanceDue,
    paidAt: latestOnline?.created_at ?? null,
    depositRequired: Number(booking.deposit_required_amount) || 0,
    paymentReference: latestWithReference?.stripe_payment_intent_id ?? null,
    paymentStatus: String(booking.payment_status),
    scanCode,
  };
}

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "Unknown";
  const m = method.toLowerCase();
  if (m === "cash") return "Cash";
  if (m === "card_offline" || m === "card_terminal" || m === "card") return "Card terminal";
  if (m === "mobile_money" || m === "momo") return "Mobile money";
  if (m === "stripe") return "Card (online)";
  return method;
}

export async function getRentalReceiptDataForStaff(
  bookingId: string,
  organizerId: string
): Promise<RentalReceiptData | null> {
  try {
    await verifyAuth(organizerId, WRITE_ROLES);
  } catch {
    return null;
  }

  const admin = createSupabaseAdmin();
  const { data: booking, error: bookingError } = await admin
    .from("rental_bookings")
    .select(
      "id, business_id, booking_number, customer_name, starts_at, ends_at, snapshot_currency, rental_amount, deposit_required_amount, payment_status"
    )
    .eq("id", bookingId)
    .eq("organizer_id", organizerId)
    .maybeSingle();

  if (bookingError || !booking) return null;

  const { data: paymentRows, error: paymentError } = await admin
    .from("rental_payments")
    .select(
      "amount, kind, method, direction, applied, created_at, stripe_payment_intent_id"
    )
    .eq("booking_id", booking.id);

  if (paymentError) return null;

  const rows = (paymentRows ?? []) as PaymentRow[];
  const credits = rows.filter(
    (row) =>
      row.applied &&
      row.direction === "credit" &&
      CREDIT_KINDS.has(row.kind)
  );
  const refunds = rows.filter(
    (row) => row.applied && row.direction === "debit" && row.kind === "refund"
  );

  const netPaid = roundMoney(sum(credits) - sum(refunds));
  if (netPaid <= 0) return null;

  const rentalAmount = Number(booking.rental_amount) || 0;
  const balanceDue = roundMoney(Math.max(0, rentalAmount - netPaid));

  const latestCredit = [...credits].sort(newestFirst)[0] ?? null;
  const latestWithReference =
    [...rows]
      .filter((row) => Boolean(row.stripe_payment_intent_id))
      .sort(newestFirst)[0] ?? null;

  const { data: business } = await admin
    .from("businesses")
    .select("name")
    .eq("id", booking.business_id)
    .maybeSingle();

  let scanCode: string | null = null;
  try {
    const { data: sc } = await admin
      .from("scan_codes")
      .select("code")
      .eq("rental_booking_id", booking.id)
      .eq("status", "active")
      .maybeSingle();
    if (sc?.code) scanCode = sc.code;
  } catch {}

  return {
    bookingNumber: String(booking.booking_number),
    businessName: String(
      (business as { name?: string | null } | null)?.name || "Rental host"
    ),
    customerName: String(booking.customer_name),
    startsAt: String(booking.starts_at),
    endsAt: String(booking.ends_at),
    currency: String(booking.snapshot_currency ?? "USD").toUpperCase(),
    rentalAmount,
    amountPaid: netPaid,
    balanceDue,
    paidAt: latestCredit?.created_at ?? null,
    depositRequired: Number(booking.deposit_required_amount) || 0,
    paymentReference: latestWithReference?.stripe_payment_intent_id ?? null,
    paymentStatus: String(booking.payment_status),
    paymentMethod: latestCredit ? formatPaymentMethod(latestCredit.method) : null,
    scanCode,
  };
}
