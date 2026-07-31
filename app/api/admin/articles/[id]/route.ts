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

  if (status === "draft") {
    // Existing "Unpublish" behavior — admin demoting an already-live article
    // back to draft. Unrestricted on current status, same as before.
    const { error } = await supabaseAdmin
      .from("articles")
      .update({ status: "draft" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (status === "published" || status === "rejected") {
    // Approve/reject — only valid from pending_review, guarded the same way
    // the payment webhooks guard their own idempotent status flips.
    const updatePayload: Record<string, unknown> = { status };
    if (status === "rejected") {
      updatePayload.rejection_reason = rejection_reason || null;
    } else {
      updatePayload.rejection_reason = null;
    }

    const { data: updated, error } = await supabaseAdmin
      .from("articles")
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
        { error: "Article is not pending review (already decided, or in draft)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Invalid status update. Admin can set status to draft, published, or rejected." },
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
    .from("articles")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
