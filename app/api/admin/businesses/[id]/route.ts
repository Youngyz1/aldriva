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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // Approve/reject — only valid from pending_review.
  if (body.status === "active" || body.status === "rejected") {
    const updatePayload: Record<string, unknown> = { status: body.status };
    updatePayload.rejection_reason = body.status === "rejected" ? (body.rejection_reason || null) : null;

    const { data: updated, error } = await supabaseAdmin
      .from("businesses")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "Business is not pending review (already decided or archived)." },
        { status: 409 }
      );
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
