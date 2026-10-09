import "server-only";
/**
 * lib/memories/retention.ts
 *
 * Guest photo retention — Round 4.
 *
 * Policy (owner-confirmed, DEC-0028):
 * - Photos are kept for 12 months after the event ends (fallback: 12
 *   months after the newest upload when the event has no dates).
 * - The organizer gets a notice email at 30 days and again at 7 days
 *   before deletion, with a download-before-delete window.
 * - DRY RUN IS THE DEFAULT: without `live` the job only logs what it
 *   WOULD do. Live deletion additionally requires
 *   `ENABLE_MEMORY_RETENTION_DELETE=1` — both, never one. Notices are
 *   emailed only on live runs with the flag on (owner-approved draft,
 *   lib/memories/retention-email.ts); anything unsent is reported as
 *   pending and never recorded.
 *
 * Logs go to stdout (host log collector).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getMemoryStorageDriverFor, type MemoryStorageProvider } from "@/lib/memories/storage";
import { getSiteUrl } from "@/lib/site-url";
import {
  computeRetentionCutoff,
  isLiveMemoryRetentionDeleteEnabled,
  MEMORY_RETENTION_LIVE_DELETE_ENV,
  MEMORY_RETENTION_NOTICE_30D_DAYS,
  MEMORY_RETENTION_NOTICE_7D_DAYS,
} from "@/lib/memories/retention-policy";
import {
  resolveMemoryNoticeRecipient,
  sendRetentionNoticeEmail,
} from "@/lib/memories/retention-email";

export interface RetentionCandidate {
  eventId: string;
  slug: string | null;
  title: string | null;
  photoCount: number;
  cutoff: string;
}

export interface RetentionNoticePending {
  eventId: string;
  slug: string | null;
  title: string | null;
  noticeKind: "30d" | "7d";
  cutoff: string;
}

export interface RetentionReport {
  dryRun: boolean;
  now: string;
  eligible: RetentionCandidate[];
  deletedPhotos: string[];
  storageRemoved: string[];
  storageErrors: string[];
  noticesPending: RetentionNoticePending[];
  noticesSent: RetentionNoticePending[];
  skippedLiveReason?: string;
}

function formatDateShort(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Sends one notice email. False = retry next run (never recorded). */
async function deliverRetentionNotice(
  args: {
    eventId: string;
    slug: string | null;
    title: string | null;
    eventUserId: string | null;
    organizerId: string | null;
    endDate: string | null;
    cutoff: Date;
    photoCount: number;
    noticeKind: "30d" | "7d";
  }
): Promise<boolean> {
  const recipient = await resolveMemoryNoticeRecipient(args.eventUserId, args.organizerId);
  if (!recipient) {
    console.error(`[MemoryRetention] no recipient for event ${args.eventId} — notice skipped.`);
    return false;
  }
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const result = await sendRetentionNoticeEmail({
    organizerName: recipient.name,
    organizerEmail: recipient.email,
    eventTitle: args.title || "Your event",
    endedOn: formatDateShort(args.endDate),
    cutoffDate: args.cutoff.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    photoCount: args.photoCount,
    daysLeft: args.noticeKind === "7d" ? 7 : 30,
    memoriesUrl: `${siteUrl}/dashboard/events/${args.eventId}/memories`,
  });
  if (!result.ok) {
    console.error(`[MemoryRetention] notice send failed for event ${args.eventId}: ${result.error}`);
    return false;
  }
  console.log(`[MemoryRetention] ${args.noticeKind} notice sent for event ${args.eventId} (${args.photoCount} photos).`);
  return true;
}

/** Never mutates. Gathers deletion candidates + due (unsent) notices. */
export async function runMemoryRetention(options: { live?: boolean; now?: Date } = {}): Promise<RetentionReport> {
  const live = options.live === true;
  const now = options.now ?? new Date();
  const admin = createSupabaseAdmin();

  const report: RetentionReport = {
    dryRun: !live,
    now: now.toISOString(),
    eligible: [],
    deletedPhotos: [],
    storageRemoved: [],
    storageErrors: [],
    noticesPending: [],
    noticesSent: [],
  };

  // Events that still hold photos.
  const { data: events, error: eventsError } = await admin
    .from("event_memories")
    .select("event_id");
  if (eventsError) throw new Error(`Retention scan failed: ${eventsError.message}`);
  const eventIds = [...new Set(((events ?? []) as { event_id: string }[]).map((r) => r.event_id))];
  if (eventIds.length === 0) return report;

  const { data: eventRows } = await admin
    .from("events")
    .select("id, slug, title, end_date, event_date, user_id, organizer_id")
    .in("id", eventIds);
  const byId = new Map(((eventRows ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r]));

  const { data: noticeRows } = await admin
    .from("event_memory_retention_notices")
    .select("event_id, notice_kind")
    .in("event_id", eventIds);
  const sentNotices = new Set(
    ((noticeRows ?? []) as { event_id: string; notice_kind: string }[]).map(
      (r) => `${r.event_id}:${r.notice_kind}`
    )
  );

  for (const eventId of eventIds) {
    const event = byId.get(eventId) as
      | { slug?: string | null; title?: string | null; end_date?: string | null; event_date?: string | null; user_id?: string | null; organizer_id?: string | null }
      | undefined;
    if (!event) continue;

    const { data: photos } = await admin
      .from("event_memories")
      .select("id, created_at, storage_provider, object_key")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    const rows = ((photos ?? []) as {
      id: string; created_at: string; storage_provider: MemoryStorageProvider; object_key: string;
    }[]);
    if (rows.length === 0) continue;

    const newestUploadAt = rows[0]?.created_at ?? null;
    const cutoff = computeRetentionCutoff({
      endDate: event.end_date ?? null,
      eventDate: event.event_date ?? null,
      newestUploadAt,
    });
    if (!cutoff) continue;

    const msToCutoff = cutoff.getTime() - now.getTime();
    const daysToCutoff = msToCutoff / 86_400_000;
    const base = {
      eventId,
      slug: event.slug ?? null,
      title: event.title ?? null,
      cutoff: cutoff.toISOString(),
    };

    // Deletion due.
    if (msToCutoff <= 0) {
      report.eligible.push({ ...base, photoCount: rows.length });
      if (!live) continue;
      if (!isLiveMemoryRetentionDeleteEnabled()) {
        report.skippedLiveReason = `${MEMORY_RETENTION_LIVE_DELETE_ENV} is not set to "1" — nothing was deleted.`;
        continue;
      }
      for (const photo of rows) {
        try {
          const driver = getMemoryStorageDriverFor(photo.storage_provider);
          await driver.delete(photo.object_key);
          report.storageRemoved.push(photo.id);
        } catch (err) {
          // Keep the row when the object cannot be removed: retry next run.
          report.storageErrors.push(`${photo.id}: ${err instanceof Error ? err.message : "unlink failed"}`);
          continue;
        }
        const { error: rowError } = await admin.from("event_memories").delete().eq("id", photo.id);
        if (rowError) {
          report.storageErrors.push(`${photo.id}: row delete failed (${rowError.message})`);
          continue;
        }
        report.deletedPhotos.push(photo.id);
      }
      // Purge notice history for fully-cleared events (fresh cycle if reused).
      await admin.from("event_memory_retention_notices").delete().eq("event_id", eventId);
      continue;
    }

    // Notice windows. The 7d notice supersedes the 30d one (see
    // dueNoticeKind): a stale unsent 30d notice never sends inside the
    // 7-day window. Pending by default; recorded + emailed only on a
    // live run with the delete flag on. The email copy itself is still
    // DRAFT (unapproved) — the flag being unset keeps delivery inert.
    const due: ("30d" | "7d")[] = [];
    if (daysToCutoff <= MEMORY_RETENTION_NOTICE_7D_DAYS) {
      if (!sentNotices.has(`${eventId}:7d`)) due.push("7d");
    } else if (daysToCutoff <= MEMORY_RETENTION_NOTICE_30D_DAYS) {
      if (!sentNotices.has(`${eventId}:30d`)) due.push("30d");
    }
    for (const noticeKind of due) {
      if (!live || !isLiveMemoryRetentionDeleteEnabled()) {
        report.noticesPending.push({ ...base, noticeKind });
        continue;
      }
      const delivered = await deliverRetentionNotice({
        eventId,
        slug: base.slug,
        title: base.title,
        eventUserId: (event.user_id as string | null) ?? null,
        organizerId: (event.organizer_id as string | null) ?? null,
        endDate: event.end_date ?? null,
        cutoff,
        photoCount: rows.length,
        noticeKind,
      });
      if (delivered) {
        await admin.from("event_memory_retention_notices").upsert(
          { event_id: eventId, notice_kind: noticeKind, sent_at: new Date().toISOString() },
          { onConflict: "event_id,notice_kind" }
        );
        sentNotices.add(`${eventId}:${noticeKind}`);
        report.noticesSent.push({ ...base, noticeKind });
      } else {
        // Retry next run: never record unsent notices.
        report.noticesPending.push({ ...base, noticeKind });
      }
    }
  }

  if (!live) {
    console.log(
      `[MemoryRetention] dry run: ${report.eligible.length} event(s) eligible for deletion, ` +
        `${report.noticesPending.length} notice(s) pending. No rows touched.`
    );
  }
  return report;
}
