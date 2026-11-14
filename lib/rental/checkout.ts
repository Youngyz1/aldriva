import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";
import { formatMoney, toMinorUnits } from "@/lib/money";

// Stripe requires a Checkout session to expire between 30 minutes and 24 hours from creation.
const MIN_SESSION_MS = 31 * 60 * 1000; // 30 min minimum plus margin for request latency
const MAX_SESSION_MS = 23 * 60 * 60 * 1000; // under the 24 h maximum
const DEADLINE_MARGIN_MS = 60 * 1000; // session ends 1 min before the booking deadline

export type RentalCheckoutResult =
  | { ok: true; url: string; reused: boolean }
  | { ok: false; reason: "not_found" | "not_payable" | "window_closing" | "config" | "error"; message: string };

type Admin = ReturnType<typeof createSupabaseAdmin>;

type PayRow = {
  id: string;
  organizer_id: string;
  booking_number: string;
  status: string;
  payment_status: string;
  snapshot_confirmation_mode: string;
  snapshot_payment_policy: string;
  amount_due_online: number | string | null;
  snapshot_currency: string | null;
  payment_due_at: string | null;
  expires_at: string | null;
};

type PrepareRow = {
  out_booking_id: string;
  out_can_create: boolean;
  out_reusable_session_id: string | null;
  out_displaced_session_id: string | null;
  out_kind: string;
  out_amount_due: number | string;
  out_currency: string | null;
  out_customer_email: string | null;
  out_booking_number: string;
  out_payment_due_at: string | null;
};

type CommitRow = { out_session_id: string; out_displaced_session_id: string | null };

const PAY_COLUMNS =
  "id, organizer_id, booking_number, status, payment_status, snapshot_confirmation_mode, snapshot_payment_policy, amount_due_online, snapshot_currency, payment_due_at, expires_at";

async function loadByToken(admin: Admin, token: string): Promise<PayRow | null> {
  const { data } = await admin.from("rental_bookings").select(PAY_COLUMNS).eq("lookup_token", token).maybeSingle();
  return (data as PayRow | null) ?? null;
}

// The moment the booking stops being payable: the payment link deadline once approved,
// or the checkout hold for an instant-mode booking that is still pending.
function deadlineOf(b: PayRow): number | null {
  const raw = b.status === "awaiting_payment" ? b.payment_due_at : b.expires_at;
  return raw ? new Date(raw).getTime() : null;
}

function fmtUtc(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function cleanMessage(msg: string): string {
  return msg.replace(/^[A-Z_]+:\s*/, "");
}

/** Expires Stripe Checkout sessions. Never throws; an already-expired or completed session is not an error here. */
export async function expireStripeSessions(ids: Array<string | null | undefined>): Promise<void> {
  const list = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (list.length === 0 || !process.env.STRIPE_SECRET_KEY) return;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  for (const id of list) {
    try {
      await stripe.checkout.sessions.expire(id);
    } catch (err) {
      console.error("[rental-checkout] expire failed for", id, err instanceof Error ? err.message : err);
    }
  }
}

/** What the lookup page needs to decide whether to show the Pay now card. */
export async function getRentalPayInfo(
  token: string
): Promise<{ payable: boolean; amountLabel: string; deadlineLabel: string | null } | null> {
  const admin = createSupabaseAdmin();
  const b = await loadByToken(admin, token);
  if (!b) return null;
  const amount = Number(b.amount_due_online ?? 0);
  const deadline = deadlineOf(b);
  const payable =
    (b.status === "awaiting_payment" || (b.status === "pending" && b.snapshot_confirmation_mode === "instant")) &&
    amount > 0 &&
    b.payment_status !== "paid" &&
    (deadline === null || deadline > Date.now());
  return {
    payable,
    amountLabel: formatMoney(amount, b.snapshot_currency ?? "USD"),
    deadlineLabel: deadline !== null ? fmtUtc(deadline) : null,
  };
}

/**
 * The single place that creates rental checkout sessions:
 * prepare (database decides amount, kind, reuse) -> create at Stripe -> commit -> expire displaced sessions.
 */
export async function createRentalCheckout(token: string): Promise<RentalCheckoutResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, reason: "config", message: "Online payment is not configured." };
  }
  const admin = createSupabaseAdmin();
  const b = await loadByToken(admin, token);
  if (!b) return { ok: false, reason: "not_found", message: "Booking not found." };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let createdId: string | null = null;

  try {
    const { data: prep, error: prepErr } = await admin.rpc("prepare_rental_checkout_session", {
      p_booking_id: b.id,
      p_organizer_id: b.organizer_id,
    });
    if (prepErr) {
      console.error("[rental-checkout] prepare failed:", prepErr.message);
      return { ok: false, reason: "error", message: cleanMessage(prepErr.message) };
    }
    const p = (Array.isArray(prep) ? prep[0] : prep) as PrepareRow | null;
    if (!p || !p.out_can_create) {
      return { ok: false, reason: "not_payable", message: "This booking cannot be paid online right now." };
    }

    // prepare already marked the old session expired in the database; close it at Stripe too
    if (p.out_displaced_session_id) await expireStripeSessions([p.out_displaced_session_id]);

    if (p.out_reusable_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(p.out_reusable_session_id);
      if (existing.status === "open" && existing.url) return { ok: true, url: existing.url, reused: true };
      // Stripe no longer has it open: fall through and create a new one (commit retires the stale row)
    }

    const now = Date.now();
    const deadline = deadlineOf(b);
    const expiresMs = Math.min(now + MAX_SESSION_MS, deadline !== null ? deadline - DEADLINE_MARGIN_MS : Infinity);
    if (expiresMs - now < MIN_SESSION_MS) {
      return {
        ok: false,
        reason: "window_closing",
        message: "The payment window is closing. Please contact the host.",
      };
    }
    const expiresAt = Math.floor(expiresMs / 1000);

    const currency = String(p.out_currency ?? b.snapshot_currency ?? "USD").toUpperCase();
    const amount = Number(p.out_amount_due);
    const unitAmount = toMinorUnits(amount, currency);
    const siteUrl = getSiteUrl().replace(/\/$/, "");
    const lookup = siteUrl + "/rentals/lookup/" + encodeURIComponent(token);
    const label = p.out_kind === "full" ? "Rental payment" : "Advance payment";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: p.out_customer_email || undefined,
      expires_at: expiresAt,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: label + " - booking #" + p.out_booking_number,
              description: "Any security deposit is collected separately at pickup.",
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: lookup + "?paid=true",
      cancel_url: lookup + "?cancelled=true",
      metadata: {
        kind: "rental",
        rental_booking_id: b.id,
        organizer_id: b.organizer_id,
        confirmation_mode: b.snapshot_confirmation_mode,
      },
    });
    createdId = session.id;
    if (!session.url) throw new Error("Stripe returned a session without a URL");

    const { data: com, error: comErr } = await admin.rpc("commit_rental_checkout_session", {
      p_booking_id: b.id,
      p_stripe_session_id: session.id,
      p_kind: p.out_kind,
      p_amount: amount,
      p_expires_at: new Date(expiresAt * 1000).toISOString(),
    });
    if (comErr) {
      // The booking changed between prepare and commit: do not leave a payable session behind
      console.error("[rental-checkout] commit failed:", comErr.message);
      await expireStripeSessions([session.id]);
      return { ok: false, reason: "not_payable", message: cleanMessage(comErr.message) };
    }
    const c = (Array.isArray(com) ? com[0] : com) as CommitRow | null;
    if (c?.out_displaced_session_id && c.out_displaced_session_id !== session.id) {
      await expireStripeSessions([c.out_displaced_session_id]);
    }

    return { ok: true, url: session.url, reused: false };
  } catch (err) {
    console.error("[rental-checkout] unexpected error:", err instanceof Error ? err.message : err);
    if (createdId) await expireStripeSessions([createdId]);
    return { ok: false, reason: "error", message: "Could not start the payment." };
  }
}