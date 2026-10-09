import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMemoryTokenFormat } from "@/lib/memories/tokens";
import { isRateLimited, rateLimitedResponse } from "@/lib/memories/guest-limits";

const REPORT_REASONS = [
  "Inappropriate content",
  "Wrong event",
  "Poor quality",
  "Spam",
  "Other",
] as const;

/**
 * POST /api/memories/[token]/report
 * Guest photo report. Increments the photo's report counter for organizer
 * review; never auto-hides (moderation stays human).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isMemoryTokenFormat(token)) {
    return NextResponse.json({ error: "This upload link is invalid or expired." }, { status: 404 });
  }

  if (await isRateLimited(req, "memoryReport", `token:${token}`)) {
    return rateLimitedResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 422 });
  }

  const memoryId = typeof body.memoryId === "string" ? body.memoryId : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!memoryId) {
    return NextResponse.json({ error: "Missing photo reference." }, { status: 422 });
  }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "Choose a valid report reason." }, { status: 422 });
  }

  const admin = createSupabaseAdmin();
  const { data: settings } = await admin
    .from("event_memory_settings")
    .select("event_id, is_active")
    .eq("upload_token", token)
    .maybeSingle();
  const row = settings as { event_id?: string; is_active?: boolean } | null;
  if (!row?.event_id || row.is_active !== true) {
    return NextResponse.json({ error: "This upload link is invalid or expired." }, { status: 404 });
  }

  const { data: photo } = await admin
    .from("event_memories")
    .select("id, report_count")
    .eq("id", memoryId)
    .eq("event_id", row.event_id)
    .maybeSingle();
  const photoRow = photo as { id?: string; report_count?: number } | null;
  if (!photoRow?.id) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const { error: reportError } = await admin.from("event_memory_reports").insert({
    memory_id: photoRow.id,
    reason,
    reporter_ip: null,
  });
  if (reportError) {
    console.error("[memories/report] insert failed:", reportError.message);
    return NextResponse.json({ error: "Could not record your report. Please try again." }, { status: 500 });
  }

  await admin
    .from("event_memories")
    .update({ report_count: (photoRow.report_count ?? 0) + 1 })
    .eq("id", photoRow.id);

  return NextResponse.json({ ok: true, message: "Thanks — the organizer will review this photo." });
}
