/**
 * app/api/identity-verification/submit/route.ts
 * POST — Submit current user's identity verification for review.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { submitUserIdentityVerification } from "@/lib/identity-verifications";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { submission_id } = body as { submission_id?: string };

  if (!submission_id) {
    return NextResponse.json({ error: "submission_id is required." }, { status: 400 });
  }

  try {
    const submission = await submitUserIdentityVerification(user.id, submission_id);
    return NextResponse.json({ submission });
  } catch (err: any) {
    console.error("[identity-verification/submit]", err);
    return NextResponse.json(
      { error: "Failed to submit identity verification." },
      { status: 400 }
    );
  }
}
