import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runMemoryRetention } from "@/lib/memories/retention";

/**
 * Scheduled guest-photo retention for past events.
 *
 * DRY RUN IS THE DEFAULT: without ?live=1 the job only computes and logs
 * deletion candidates + pending notices and touches nothing. Live deletion
 * additionally requires ENABLE_MEMORY_RETENTION_DELETE=1 in the
 * environment — both, never one (the flag is currently unset everywhere,
 * so live runs only report). The notice email copy is DRAFT and unapproved;
 * notices are recorded only after a successful send.
 * Logs go to stdout (host log collector).
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const live = request.nextUrl.searchParams.get("live") === "1";

  try {
    const report = await runMemoryRetention({ live });
    return NextResponse.json({
      success: true,
      dryRun: report.dryRun,
      eligible: report.eligible,
      deletedPhotos: report.deletedPhotos,
      storageRemoved: report.storageRemoved,
      storageErrors: report.storageErrors,
      noticesPending: report.noticesPending,
      noticesSent: report.noticesSent,
      skippedLiveReason: report.skippedLiveReason,
    });
  } catch (err) {
    console.error("[MemoryRetention]", err);
    return NextResponse.json({ error: "Retention run failed." }, { status: 500 });
  }
}
