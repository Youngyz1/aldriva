import { Resend } from "resend";
import { BRAND } from "@/config/branding";
import { formatMoney } from "@/lib/money";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type RentalEmailKind =
  | "request_received"
  | "confirmed"
  | "payment_received"
  | "declined"
  | "cancelled"
  | "expired";

type BookingRow = {
  id: string;
  organizer_id: string;
  status: string;
  booking_number: string;
  lookup_token: string;
  customer_name: string;
  customer_email: string | null;
  starts_at: string;
  ends_at: string;
  payment_due_at: string | null;
  amount_due_online: number | string | null;
  rental_amount: number | string | null;
  deposit_required_amount: number | string | null;
  snapshot_currency: string | null;
  snapshot_payment_policy: string | null;
};

type Admin = ReturnType<typeof createSupabaseAdmin>;

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function shell(
  title: string,
  intro: string,
  rows: Array<[string, string]>,
  button?: { href: string; label: string },
  secondary?: { href: string; label: string }
): string {
  const detail = rows
    .map(([k, v]) => `<p style="margin: 4px 0; font-size: 14px; color: #71717a;">${esc(k)}: <strong style="color: #18181b;">${esc(v)}</strong></p>`)
    .join("");
  const btn = button
    ? `<div style="margin: 20px 0;"><a href="${esc(button.href)}" style="display: inline-block; background-color: #c2410c; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 20px; border-radius: 8px; font-size: 14px;">${esc(button.label)}</a></div>`
    : "";
  const secondaryLink = secondary
    ? `<p style="margin: -8px 0 20px; font-size: 13px;"><a href="${esc(secondary.href)}" style="color: #52525b; text-decoration: underline;">${esc(secondary.label)}</a></p>`
    : "";
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #18181b;">
    <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">${esc(title)}</h2>
    <p style="color: #52525b; font-size: 14px; margin-top: 0;">${intro}</p>
    <div style="background: #f4f4f5; border-radius: 12px; padding: 16px; margin: 20px 0;">${detail}</div>
    ${btn}
    ${secondaryLink}
  </div>`;
}

type Attachment = { filename: string; content: string };

async function deliver(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<string | null> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `${BRAND.name} <${BRAND.contactEmail}>`,
      to,
      subject,
      html,
      ...(attachments && attachments.length ? { attachments } : {}),
    } as any);
    return error ? `${error.name}: ${error.message}` : null;
  } catch (err) {
    return err instanceof Error ? err.message : "send failed";
  }
}

async function logEvent(admin: Admin, b: BookingRow, type: string, payload: Record<string, unknown>) {
  const { error } = await admin
    .from("rental_booking_events")
    .insert({ booking_id: b.id, organizer_id: b.organizer_id, event_type: type, payload });
  if (error) console.error("[rental-emails] event insert failed:", error.message);
}

async function ownerEmail(admin: Admin, organizerId: string): Promise<string | null> {
  const { data: org } = await admin.from("organizers").select("user_id, contact_email").eq("id", organizerId).maybeSingle();
  const o = org as { user_id?: string; contact_email?: string | null } | null;
  if (o?.contact_email) return o.contact_email;
  if (!o?.user_id) return null;
  const { data: prof } = await admin.from("profiles").select("email").eq("id", o.user_id).maybeSingle();
  return (prof as { email?: string | null } | null)?.email ?? null;
}

/**
 * Sends the rental email for one event. Never throws: an email failure must not fail the booking action.
 * "confirmed" becomes the pay-link email automatically when the booking is awaiting_payment.
 */
export async function sendRentalEmail(
  kind: RentalEmailKind,
  bookingId: string,
  opts: { reason?: string | null } = {}
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("[rental-emails] RESEND_API_KEY is not set; skipping", kind);
      return;
    }
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("rental_bookings")
      .select("id, organizer_id, status, booking_number, lookup_token, customer_name, customer_email, starts_at, ends_at, payment_due_at, amount_due_online, rental_amount, deposit_required_amount, snapshot_currency, snapshot_payment_policy")
      .eq("id", bookingId)
      .maybeSingle();
    const b = data as BookingRow | null;
    if (!b) {
      console.error("[rental-emails] booking not found:", bookingId);
      return;
    }

    const lookupUrl = `${BRAND.website}/rentals/lookup/${b.lookup_token}`;
    const period: Array<[string, string]> = [
      ["Booking number", "#" + b.booking_number],
      ["Pickup", fmt(b.starts_at)],
      ["Return", fmt(b.ends_at)],
    ];
    const hi = `Hi ${esc(b.customer_name)}, `;

    let template: string = kind;
    let subject = "";
    let html = "";
    if (kind === "request_received") {
      subject = `[${BRAND.name}] Rental request received #${b.booking_number}`;
      html = shell("Request received", hi + "your rental request is with the host. <strong>Nothing is confirmed yet.</strong> You will get an email when it is reviewed.", period, { href: lookupUrl, label: "Track your request" });
    } else if (kind === "payment_received") {
      const currency = String(b.snapshot_currency ?? "USD").toUpperCase();
      const paidOnline = Number(b.amount_due_online ?? 0);
      const balanceDue = Math.max(
        0,
        Number(b.rental_amount ?? 0) - paidOnline
      );
      const deposit = Number(b.deposit_required_amount ?? 0);
      const receiptRows: Array<[string, string]> = [
        ...period,
        ["Amount paid", formatMoney(paidOnline, currency)],
      ];
      if (balanceDue > 0) {
        receiptRows.push([
          "Balance due at pickup",
          formatMoney(balanceDue, currency),
        ]);
      }
      receiptRows.push([
        "Security deposit",
        deposit > 0
          ? `${formatMoney(deposit, currency)} collected separately at pickup`
          : "Not required",
      ]);
      subject = `[${BRAND.name}] Payment received #${b.booking_number}`;
      html = shell(
        "Payment received",
        hi +
          "we received your payment. Your receipt is ready to view or download.",
        receiptRows,
        { href: `${lookupUrl}?paid=true`, label: "View receipt" },
        {
          href: `${BRAND.website}/api/rentals/receipt/${b.lookup_token}`,
          label: "Download PDF",
        }
      );
    } else if (kind === "confirmed" && b.status === "awaiting_payment") {
      template = "pay_link";
      const amt = Number(b.amount_due_online ?? 0).toFixed(2) + " " + String(b.snapshot_currency ?? "USD").toUpperCase();
      const rows: Array<[string, string]> = [...period, ["Amount due online", amt]];
      if (b.payment_due_at) rows.push(["Pay before", fmt(b.payment_due_at)]);
      subject = `[${BRAND.name}] Your rental is approved: payment needed #${b.booking_number}`;
      html = shell("Approved: complete your payment", hi + "the host approved your request. Your booking is held until the deadline below. <strong>It is confirmed once payment is received.</strong>", rows, { href: lookupUrl, label: "Pay now" });
    } else if (kind === "confirmed") {
      subject = `[${BRAND.name}] Rental confirmed #${b.booking_number}`;
      html = shell("Booking confirmed", hi + "your rental is confirmed. Please bring your valid driver's license. Payment is collected at pickup.", period, { href: lookupUrl, label: "View your booking" });
    } else if (kind === "declined") {
      subject = `[${BRAND.name}] Rental request declined #${b.booking_number}`;
      html = shell("Request declined", hi + "unfortunately the host could not accept this request.", period);
    } else if (kind === "cancelled") {
      subject = `[${BRAND.name}] Rental cancelled #${b.booking_number}`;
      html = shell("Booking cancelled", hi + "the host cancelled this booking. Contact the host if you have questions about payments or refunds.", period);
    } else {
      const timeout = opts.reason === "payment_timeout";
      subject = `[${BRAND.name}] Rental request expired #${b.booking_number}`;
      html = shell("Request expired", hi + (timeout ? "we did not receive payment before the deadline, so the booking was released." : "this request was not confirmed in time, so it was released."), period);
    }

    const results: Array<{ to: string; error: string | null }> = [];
    let attachments: Attachment[] | undefined;
    if (kind === "confirmed" && b.customer_email) {
      try {
        const { getRentalAgreementDataByBookingId, generateRentalAgreementPdf } = await import("@/lib/rental/agreement");
        const ad = await getRentalAgreementDataByBookingId(bookingId);
        if (ad) {
          const pdf = generateRentalAgreementPdf(ad);
          attachments = [{ filename: `rental_agreement_${ad.bookingNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`, content: pdf.toString("base64") }];
        }
      } catch (e) {
        console.error("[rental-emails] agreement attachment failed:", e instanceof Error ? e.message : e);
      }
    }
    if (b.customer_email) results.push({ to: "customer", error: await deliver(b.customer_email, subject, html, attachments) });

    if (kind === "request_received") {
      const to = await ownerEmail(admin, b.organizer_id);
      if (to) {
        const ownerHtml = shell(
          "New rental request",
          `${esc(b.customer_name)} sent a request that needs your review.`,
          period,
          { href: `${BRAND.website}/dashboard/org/${b.organizer_id}/rentals/${b.id}`, label: "Review in dashboard" }
        );
        results.push({ to: "owner", error: await deliver(to, `[${BRAND.name}] New rental request #${b.booking_number}`, ownerHtml) });
      }
    }

    for (const r of results) {
      if (r.error) {
        console.error("[rental-emails] failed:", template, r.to, r.error);
        await logEvent(admin, b, "email_failed", { template, to: r.to, error: r.error });
      } else {
        await logEvent(admin, b, "email_sent", { template, to: r.to });
        if (template === "pay_link" && r.to === "customer") await logEvent(admin, b, "payment_link_sent", { payment_due_at: b.payment_due_at });
      }
    }
  } catch (err) {
    console.error("[rental-emails] unexpected error:", err instanceof Error ? err.message : err);
  }
}
