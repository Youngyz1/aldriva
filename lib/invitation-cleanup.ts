import "server-only";
/**
 * lib/invitation-cleanup.ts
 *
 * Stale untouched-invitation-draft cleanup (Round 3 COMMIT 2).
 *
 * A draft is eligible ONLY when ALL are true:
 * - kind = 'invitation'
 * - status = 'draft'
 * - title is still the placeholder
 * - no event_invitation_pages row
 * - no event_invitations (guests)
 * - no seating assignments (seats.assigned_invitation_id)
 * - no ticket orders and no ticket instances
 * - no memory settings/memories (when those Round 4 tables exist)
 * - created_at older than 30 days
 *
 * DRY RUN IS THE DEFAULT: the job logs the ids it WOULD delete and
 * deletes nothing. Real deletion needs an explicit live flag AND the
 * ENABLE_INVITATION_DRAFT_DELETE=1 environment guard — both, never one.
 * Logs go to stdout (captured by the host's log collector).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { INVITATION_DRAFT_TITLE } from "@/lib/invitation-events";

export const INVITATION_DRAFT_RETENTION_DAYS = 30;
const LIVE_DELETE_ENV = "ENABLE_INVITATION_DRAFT_DELETE";

export interface StaleDraftCandidate {
  id: string;
  slug: string | null;
  created_at: string;
}

export interface CleanupReport {
  dryRun: boolean;
  cutoff: string;
  eligible: StaleDraftCandidate[];
  deleted: string[];
  storageRemoved: string[];
  skippedLiveDeleteReason?: string;
}

/** Counts related rows; missing tables (Round 4 not applied) count as zero. */
async function countRelated(
  admin: ReturnType<typeof createSupabaseAdmin>,
  table: string,
  column: string,
  ids: string[]
): Promise<Set<string>> {
  const hit = new Set<string>();
  const { data, error } = await admin
    .from(table as never)
    .select(column as never)
    .in(column as never, ids);
  if (error) {
    // Round 4 tables may not exist yet — that means "no memories", not failure.
    if (/does not exist|could not find|schema cache/i.test(error.message)) return hit;
    throw new Error(`Related-row check failed on ${table}: ${error.message}`);
  }
  for (const row of ((data ?? []) as unknown as Record<string, string>[])) {
    if (row[column]) hit.add(row[column]);
  }
  return hit;
}

/** All-true eligibility scan. Never mutates. */
export async function findStaleInvitationDrafts(): Promise<StaleDraftCandidate[]> {
  const admin = createSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INVITATION_DRAFT_RETENTION_DAYS);

  const { data: drafts, error } = await admin
    .from("events")
    .select("id, slug, created_at")
    .eq("kind", "invitation")
    .eq("status", "draft")
    .eq("title", INVITATION_DRAFT_TITLE)
    .lt("created_at", cutoff.toISOString());
  if (error) throw new Error(`Draft scan failed: ${error.message}`);

  const rows = (drafts ?? []) as StaleDraftCandidate[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Any related row in these tables disqualifies the draft.
  // Memory tables are included unconditionally: when Round 4 has not been
  // applied yet, the select fails table-missing and counts as zero.
  const related: { table: string; column: string }[] = [
    { table: "event_invitation_pages", column: "event_id" },
    { table: "event_invitations", column: "event_id" },
    { table: "ticket_orders", column: "event_id" },
    { table: "ticket_instances", column: "event_id" },
    { table: "event_memory_settings", column: "event_id" },
    { table: "event_memories", column: "event_id" },
  ];

  const tainted = new Set<string>();
  for (const rel of related) {
    for (const id of await countRelated(admin, rel.table, rel.column, ids)) {
      tainted.add(id);
    }
  }

  // Seating assignments reference invitations, not events: any assigned
  // seat whose invitation belongs to a candidate draft disqualifies it.
  const { data: assignedSeats } = await admin
    .from("seats")
    .select("assigned_invitation_id")
    .not("assigned_invitation_id", "is", null);
  const assignedInvitationIds = new Set(
    ((assignedSeats ?? []) as { assigned_invitation_id: string }[]).map(
      (s) => s.assigned_invitation_id
    )
  );
  if (assignedInvitationIds.size > 0) {
    const { data: linkedInvites } = await admin
      .from("event_invitations")
      .select("event_id")
      .in("id", Array.from(assignedInvitationIds));
    for (const row of (linkedInvites ?? []) as { event_id: string }[]) {
      if (row.event_id) tainted.add(row.event_id);
    }
  }

  return rows.filter((r) => !tainted.has(r.id));
}

/**
 * Runs the job. Dry run (default): logs candidates, deletes nothing.
 * Live deletion requires live=true AND the environment guard, deletes the
 * event rows (page rows cascade) plus storage prefixes, and returns them.
 */
export async function runInvitationDraftCleanup(opts?: { live?: boolean }): Promise<CleanupReport> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INVITATION_DRAFT_RETENTION_DAYS);
  const eligible = await findStaleInvitationDrafts();
  const ids = eligible.map((e) => e.id);

  console.log(
    `[InvitationDraftCleanup] ${eligible.length} stale untouched draft(s) older than ${cutoff.toISOString()}: ${ids.join(", ") || "(none)"}`
  );

  if (!opts?.live) {
    return { dryRun: true, cutoff: cutoff.toISOString(), eligible, deleted: [], storageRemoved: [] };
  }
  if (process.env[LIVE_DELETE_ENV] !== "1") {
    return {
      dryRun: true,
      cutoff: cutoff.toISOString(),
      eligible,
      deleted: [],
      storageRemoved: [],
      skippedLiveDeleteReason: `Live deletion refused: ${LIVE_DELETE_ENV} is not "1". Nothing was deleted.`,
    };
  }

  const admin = createSupabaseAdmin();
  const storageRemoved: string[] = [];
  for (const id of ids) {
    for (const bucket of ["cms-media", "invitation-media"]) {
      const { data: objects } = await admin.storage.from(bucket).list(id);
      const paths = (objects ?? []).map((o) => `${id}/${o.name}`);
      if (paths.length > 0) {
        const { error } = await admin.storage.from(bucket).remove(paths);
        if (!error) storageRemoved.push(`${bucket}/${id}/ (${paths.length} file(s))`);
        else console.log(`[InvitationDraftCleanup] storage remove failed for ${bucket}/${id}: ${error.message}`);
      }
    }
  }

  const { error: deleteError } = await admin.from("events").delete().in("id", ids);
  if (deleteError) throw new Error(`Draft delete failed: ${deleteError.message}`);
  console.log(`[InvitationDraftCleanup] deleted ${ids.length} draft(s): ${ids.join(", ")}`);
  return { dryRun: false, cutoff: cutoff.toISOString(), eligible, deleted: ids, storageRemoved };
}
