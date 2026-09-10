/**
 * app/api/organizer-verification/[id]/upload-url/route.ts
 * POST — Generate a signed upload URL for an organizer verification document.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEntityRole, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";

const supabaseAdmin = createSupabaseAdmin();

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

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
    .select("id, user_id")
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
  const { doc_type, fileName, fileSize, submission_id } = body as {
    doc_type?: string;
    fileName?: string;
    fileSize?: number;
    submission_id?: string;
  };

  if (!doc_type || !fileName || !submission_id) {
    return NextResponse.json(
      { error: "doc_type, fileName, and submission_id are required." },
      { status: 400 }
    );
  }

  // 3. Verify submission exists, belongs to this organizer, and is in a mutable state
  const { data: submission, error: subError } = await supabaseAdmin
    .from("organizer_verification_submissions")
    .select("id, status")
    .eq("id", submission_id)
    .eq("organizer_id", id)
    .maybeSingle();

  if (subError || !submission) {
    return NextResponse.json({ error: "Submission draft not found." }, { status: 404 });
  }

  if (submission.status !== "draft" && submission.status !== "needs_more_info") {
    return NextResponse.json(
      { error: `Cannot upload documents to a submission in '${submission.status}' status.` },
      { status: 400 }
    );
  }

  // 4. File type & size validation
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File size exceeds the 10MB limit.` },
      { status: 400 }
    );
  }

  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  // Strictly enforce path structure: {organizer_id}/{submission_id}/{doc_type}_{timestamp}_{filename}
  const path = `${id}/${submission_id}/${doc_type}_${Date.now()}_${sanitizedFileName}`;

  // 5. Generate signed upload URL via service role
  const { data, error } = await supabaseAdmin.storage
    .from("organizer-verification-docs")
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[organizer-verification/upload-url]", error);
    return NextResponse.json({ error: "Failed to create signed upload URL." }, { status: 500 });
  }

  // Also get a signed read URL for client-side preview
  const { data: readData } = await supabaseAdmin.storage
    .from("organizer-verification-docs")
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    readUrl: readData?.signedUrl ?? null,
  });
}
