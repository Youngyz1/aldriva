import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type DonationRecordResult = {
  inserted: boolean;
  fundraiserId: string | null;
  reason: string;
};

type DonationTotalRow = {
  amount: number | string | null;
  status?: string | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function metadataUserId(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

async function donationExists(paymentIntentId: string) {
  const { data, error } = await supabaseAdmin
    .from("donations")
    .select("id")
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error && error.code === "42703") return false;
  if (error) throw error;
  return Boolean(data);
}

export async function recalculateFundraiserRaised(fundraiserId: string) {
  const initial = await supabaseAdmin
    .from("donations")
    .select("amount, status")
    .eq("fundraiser_id", fundraiserId);
  let data = initial.data as DonationTotalRow[] | null;
  let error = initial.error;

  if (error && error.code === "42703") {
    const retry = await supabaseAdmin
      .from("donations")
      .select("amount")
      .eq("fundraiser_id", fundraiserId);

    data = retry.data as DonationTotalRow[] | null;
    error = retry.error;
  }

  if (error) {
    console.error("Donation total recalculation error:", error.message);
    return;
  }

  const total = (data || []).reduce((sum, donation) => {
    const status = donation.status ?? "succeeded";
    return status === "completed" || status === "succeeded"
      ? sum + Number(donation.amount || 0)
      : sum;
  }, 0);

  const { error: updateError } = await supabaseAdmin
    .from("fundraisers")
    .update({ raised: total })
    .eq("id", fundraiserId);

  if (updateError) {
    console.error("Fundraiser raised update error:", updateError.message);
  }
}

export async function recordDonationFromSession(
  session: Stripe.Checkout.Session
): Promise<DonationRecordResult> {
  const meta = session.metadata || {};
  const fundraiserId = meta.fundraiser_id || null;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.id;

  if (meta.kind !== "donation" || !fundraiserId) {
    return { inserted: false, fundraiserId, reason: "not_donation" };
  }

  if (await donationExists(paymentIntentId)) {
    await recalculateFundraiserRaised(fundraiserId);
    return { inserted: false, fundraiserId, reason: "exists" };
  }

  const amount = Number(meta.amount) || (session.amount_total ?? 0) / 100;
  const currency = session.currency?.toUpperCase() || "USD";
  const resolvedUserId = metadataUserId(meta.user_id);

  // Invoke record_donation_and_credit RPC atomically (inserts donation AND credits recipient ledger)
  const { data: rpcData, error: rpcError } = await supabaseAdmin
    .rpc("record_donation_and_credit", {
      p_fundraiser_id: fundraiserId,
      p_donor_name: meta.donor_name || "Anonymous",
      p_donor_email: meta.donor_email || session.customer_email || null,
      p_user_id: resolvedUserId,
      p_message: meta.message || null,
      p_amount: amount,
      p_currency: currency,
      p_payment_intent_id: paymentIntentId,
    });

  if (!rpcError && rpcData && rpcData.length > 0) {
    const resultRow = rpcData[0];
    if (resultRow.is_new) {
      if (meta.message && meta.message.trim()) {
        await supabaseAdmin.from("comments").insert({
          target_type: "fundraiser",
          target_id: fundraiserId,
          author_name: meta.donor_name || "Anonymous",
          author_email: meta.donor_email || session.customer_email || null,
          user_id: resolvedUserId,
          body: meta.message.trim(),
          status: "approved",
          payment_intent_id: paymentIntentId,
        });
      }
      await recalculateFundraiserRaised(fundraiserId);
      return { inserted: true, fundraiserId, reason: "inserted" };
    } else {
      await recalculateFundraiserRaised(fundraiserId);
      return { inserted: false, fundraiserId, reason: "exists" };
    }
  }

  const errorMessage = rpcError?.message ?? "record_donation_and_credit RPC returned no data";
  console.error("Donation record_donation_and_credit RPC error:", errorMessage);
  return { inserted: false, fundraiserId, reason: errorMessage };
}

export async function recordDonationFromStripeSessionId(sessionId: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { inserted: false, fundraiserId: null, reason: "stripe_not_configured" };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return recordDonationFromSession(session);
}
