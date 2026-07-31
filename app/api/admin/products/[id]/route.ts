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
  const { status, rejection_reason } = await req.json();

  if (status !== "active" && status !== "rejected") {
    return NextResponse.json(
      { error: "Invalid status update. Admin can set status to active or rejected." },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = { status };
  updatePayload.rejection_reason = status === "rejected" ? (rejection_reason || null) : null;

  const { data: updated, error } = await supabaseAdmin
    .from("products")
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
      { error: "Product is not pending review (already decided or archived)." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
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
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
