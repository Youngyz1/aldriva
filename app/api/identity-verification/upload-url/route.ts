/**
 * app/api/identity-verification/upload-url/route.ts
 * POST — Generate signed upload URL for current user's identity document.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserLatestIdentityVerification } from "@/lib/identity-verifications";

const supabaseAdmin = createSupabaseAdmin();

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Verify submission exists and belongs to current user
  const latest = await getUserLatestIdentityVerification(user.id);
  if (!latest || latest.id !== submission_id) {
    return NextResponse.json({ error: "Submission draft not found." }, { status: 404 });
  }

  if (latest.status !== "draft" && latest.status !== "needs_more_info") {
    return NextResponse.json(
      { error: `Cannot upload documents to a submission in '${latest.status}' state.` },
      { status: 400 }
    );
  }

  // App-layer validation (extension & size)
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Invalid file extension '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File size exceeds the 10MB limit." },
      { status: 400 }
    );
  }

  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${user.id}/${submission_id}/${doc_type}_${Date.now()}_${sanitizedFileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from("user-identity-docs")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create signed upload URL." }, { status: 500 });
  }

  const { data: readData } = await supabaseAdmin.storage
    .from("user-identity-docs")
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    readUrl: readData?.signedUrl ?? null,
  });
}
