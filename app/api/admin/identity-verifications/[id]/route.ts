/**
 * app/api/admin/identity-verifications/[id]/route.ts
 * PATCH — Admin route to approve, reject, or request more info for user identity submission.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reviewUserIdentitySubmission } from "@/lib/identity-verifications";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = await isAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const { status, reviewer_notes } = body as {
    status?: "approved" | "rejected" | "needs_more_info";
    reviewer_notes?: string;
  };

  if (!status || !["approved", "rejected", "needs_more_info"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Allowed values: approved, rejected, needs_more_info." },
      { status: 400 }
    );
  }

  try {
    const submission = await reviewUserIdentitySubmission({
      submissionId: id,
      adminUserId: user.id,
      status,
      reviewerNotes: reviewer_notes,
    });

    return NextResponse.json({ success: true, submission });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to review identity submission." },
      { status: 500 }
    );
  }
}
