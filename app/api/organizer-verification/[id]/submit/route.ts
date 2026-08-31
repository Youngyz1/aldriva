/**
 * app/api/organizer-verification/[id]/submit/route.ts
 * POST — Submit verification documents for admin review.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEntityRole, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";
import { getRequirementsForOrgType } from "@/lib/organizer-verification-requirements";

const supabaseAdmin = createSupabaseAdmin();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 1. Verify organizer exists
  const { data: organizer, error: orgError } = await supabaseAdmin
    .from("organizers")
    .select("id, user_id, org_type")
    .eq("id", id)
    .maybeSingle();

  if (orgError || !organizer) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  // 2. Defense-in-depth authorization check: user must be owner or manager
  const role = await getEntityRole(user.id, id);
  const isOwner = organizer.user_id === user.id;
  const isAuthorized = isOwner || (role !== null && ENTITY_ROLES_MANAGE.includes(role));

  if (!isAuthorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { submission_id } = body as { submission_id?: string };

  if (!submission_id) {
    return NextResponse.json({ error: "submission_id is required." }, { status: 400 });
  }

  // 3. Fetch submission row
  const { data: submission, error: subError } = await supabaseAdmin
    .from("organizer_verification_submissions")
    .select("*")
    .eq("id", submission_id)
    .eq("organizer_id", id)
    .maybeSingle();

  if (subError || !submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (submission.status !== "draft" && submission.status !== "needs_more_info") {
    return NextResponse.json(
      { error: `Cannot submit a verification request in '${submission.status}' status.` },
      { status: 400 }
    );
  }

  // 4. Validate that all required document types for org_type are present
  const requirements = getRequirementsForOrgType(organizer.org_type);
  const requiredTypes = requirements.filter((r) => r.required).map((r) => r.type);
  const submittedDocs = (submission.documents as Array<{ doc_type: string }>) ?? [];
  const submittedDocTypes = new Set(submittedDocs.map((d) => d.doc_type));

  const missingTypes = requiredTypes.filter((type) => !submittedDocTypes.has(type));
  if (missingTypes.length > 0) {
    return NextResponse.json(
      { error: `Missing required document types: ${missingTypes.join(", ")}` },
      { status: 400 }
    );
  }

  // 5. Submit! Update status to 'submitted'
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("organizer_verification_submissions")
    .update({
      status: "submitted",
      submitted_at: now,
      org_type: organizer.org_type,
      updated_at: now,
    })
    .eq("id", submission_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, submission: updated });
}
