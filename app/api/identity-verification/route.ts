/**
 * app/api/identity-verification/route.ts
 * GET — Retrieve current user's latest identity verification submission.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserLatestIdentityVerification } from "@/lib/identity-verifications";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const submission = await getUserLatestIdentityVerification(user.id);
  return NextResponse.json({ submission });
}
