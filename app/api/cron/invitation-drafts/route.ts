import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runInvitationDraftCleanup } from "@/lib/invitation-cleanup";

/**
 * Nightly cleanup for stale untouched invitation drafts.
 *
 * DRY RUN IS THE DEFAULT: without ?live=1 the job only logs the event
 * ids it would delete and deletes nothing. Live deletion additionally
 * requires ENABLE_INVITATION_DRAFT_DELETE=1 in the environment.
 * Logs go to stdout (host log collector).
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const live = request.nextUrl.searchParams.get("live") === "1";

  try {
    const report = await runInvitationDraftCleanup({ live });
    return NextResponse.json({
      success: true,
      dryRun: report.dryRun,
      eligible: report.eligible.map((e) => e.id),
      deleted: report.deleted,
      storageRemoved: report.storageRemoved,
      skippedLiveDeleteReason: report.skippedLiveDeleteReason,
    });
  } catch (err) {
    console.error("[InvitationDraftCleanup]", err);
    return NextResponse.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
