/**
 * app/api/organizer-verification/[id]/draft/route.ts
 * POST — Create or update a draft verification submission.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEntityRole, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";

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
  const { documents, submitter_notes, create_new } = body as {
    documents?: Array<{ doc_type: string; storage_path: string; file_name?: string; uploaded_at?: string }>;
    submitter_notes?: string;
    create_new?: boolean;
  };

  // 3. Find most recent submission
  const { data: mostRecent } = await supabaseAdmin
    .from("organizer_verification_submissions")
    .select("*")
    .eq("organizer_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let targetSubmission = null;

  if (
    !create_new &&
    mostRecent &&
    (mostRecent.status === "draft" || mostRecent.status === "needs_more_info")
  ) {
    // Update existing draft or needs_more_info row
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("organizer_verification_submissions")
      .update({
        documents: documents ?? mostRecent.documents,
        submitter_notes: submitter_notes !== undefined ? submitter_notes : mostRecent.submitter_notes,
        org_type: organizer.org_type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mostRecent.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    targetSubmission = updated;
  } else {
    // Create fresh draft row (for brand new attempt, or after past rejection)
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("organizer_verification_submissions")
      .insert({
        organizer_id: id,
        status: "draft",
        org_type: organizer.org_type,
        documents: documents ?? [],
        submitter_notes: submitter_notes ?? null,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    targetSubmission = inserted;
  }

  return NextResponse.json({ success: true, submission: targetSubmission });
}
