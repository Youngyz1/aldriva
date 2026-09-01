/**
 * app/api/identity-verification/draft/route.ts
 * POST — Create or update current user's draft identity verification submission.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveUserIdentityDraft, UserIdentityDoc } from "@/lib/identity-verifications";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id_type, documents, submitter_notes, create_new } = body as {
    id_type?: string;
    documents?: UserIdentityDoc[];
    submitter_notes?: string;
    create_new?: boolean;
  };

  try {
    const submission = await saveUserIdentityDraft(user.id, {
      id_type,
      documents,
      submitter_notes,
      create_new,
    });
    return NextResponse.json({ submission });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save draft." },
      { status: 400 }
    );
  }
}
