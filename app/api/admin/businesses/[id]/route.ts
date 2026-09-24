import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/admin-data";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  // Existing flag/unflag moderation action — unchanged.
  if (typeof body.is_flagged === "boolean") {
    const { error } = await supabaseAdmin
      .from("businesses")
      .update({ is_flagged: body.is_flagged })
      .eq("id", id);

    if (error) {
      console.error("[admin/businesses/[id]]", error);
      return NextResponse.json({ error: "Could not update the business." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // Approve/reject — only valid from pending_review.
  if (body.status === "active" || body.status === "rejected") {
    const updatePayload: Record<string, unknown> = {
      status: body.status,
      screened_at: new Date().toISOString(),
    };
    updatePayload.rejection_reason = body.status === "rejected" ? (body.rejection_reason || null) : null;
    // Also update screening_risk_score to reflect manual decision (keep existing or set 0 for approve, 100 for reject if not provided)

    const { data: updated, error } = await supabaseAdmin
      .from("businesses")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/businesses/[id]]", error);
      return NextResponse.json({ error: "Could not review the business." }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "Business is not pending review (already decided or archived)." },
        { status: 409 }
      );
    }
    // Insert manual moderation event (service role, actor = admin id)
    try {
      const { createSupabaseServer } = await import("@/lib/supabase-server");
      const supabase = await createSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      const actor = user?.id || null;
      // Fetch current risk score for event
      const { data: biz } = await supabaseAdmin.from("businesses").select("screening_risk_score").eq("id", id).maybeSingle();
      const risk = (biz as any)?.screening_risk_score ?? (body.status === "active" ? 0 : 100);
      await supabaseAdmin.from("business_moderation_events").insert({
        business_id: id,
        decision: body.status === "active" ? "manual_approved" : "manual_rejected",
        risk_score: risk,
        reasons: body.rejection_reason ? [body.rejection_reason] : [],
        actor,
      });
    } catch (e) {
      console.error("[admin/businesses/[id]] moderation event insert failed", e);
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Invalid parameters. Provide is_flagged (boolean), or status (active/rejected)." },
    { status: 400 }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("businesses")
      .delete()
      .eq("id", id);

  if (error) {
    console.error("[admin/businesses/[id]]", error);
    return NextResponse.json({ error: "Could not delete the business." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
