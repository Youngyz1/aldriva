/**
 * lib/event-audit.ts
 * Authoritative Append-Only Operational Audit Logger for Aldriva Events.
 * Tracks operational mutations (guests, seating, invitations, tickets, check-ins, exports, staff roles).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type AuditAction =
  | "guest_created"
  | "guest_updated"
  | "guest_deleted"
  | "guest_imported_bulk"
  | "invitation_sent"
  | "invitation_resent"
  | "invitation_revoked"
  | "invitation_restored"
  | "invitation_reassigned"
  | "rsvp_updated"
  | "seat_assigned"
  | "seat_reassigned"
  | "seat_released"
  | "ticket_issued"
  | "ticket_updated"
  | "ticket_canceled"
  | "checkin_attempted"
  | "checkin_completed"
  | "checkin_rejected"
  | "export_generated"
  | "staff_role_changed"
  | "lifecycle_transition"
  | "retention_purge";

export type AuditTargetType =
  | "guest"
  | "invitation"
  | "seat"
  | "ticket"
  | "ticket_instance"
  | "checkin"
  | "export"
  | "staff_member"
  | "event";

export interface LogEventActionParams {
  eventId: string;
  actorUserId?: string | null;
  actorRole?: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  event_id: string;
  actor_user_id: string | null;
  actor_role: string;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_email?: string | null;
  actor_name?: string | null;
}

/**
 * Appends an immutable audit log record to event_audit_logs.
 * Non-throwing so telemetry issues do not break the main transaction,
 * but returns success/failure boolean and logs warnings.
 */
export async function logEventAction(params: LogEventActionParams): Promise<{ success: boolean; logId?: string }> {
  try {
    const admin = createSupabaseAdmin();

    const payload = {
      event_id: params.eventId,
      actor_user_id: params.actorUserId || null,
      actor_role: params.actorRole || "system",
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId || null,
      metadata: params.metadata || {},
    };

    const { data, error } = await admin
      .from("event_audit_logs")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.warn("[event-audit] Failed to write audit log:", error.message);
      return { success: false };
    }

    return { success: true, logId: data?.id };
  } catch (err: unknown) {
    console.warn("[event-audit] Exception writing audit log:", err);
    return { success: false };
  }
}

/**
 * Loads recent audit log history for an authorized event organizer/manager.
 */
export async function getEventAuditHistory(
  eventId: string,
  options: { limit?: number; offset?: number; action?: string } = {}
): Promise<{ items: AuditLogEntry[]; total: number }> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const offset = Math.max(options.offset || 0, 0);

  let query = admin
    .from("event_audit_logs")
    .select("id, event_id, actor_user_id, actor_role, action, target_type, target_id, metadata, created_at", {
      count: "exact",
    })
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.action) {
    query = query.eq("action", options.action);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[event-audit] Failed to fetch audit logs:", error.message);
    return { items: [], total: 0 };
  }

  // Enrich with actor profiles if available
  const actorIds = Array.from(new Set((data || []).map((d) => d.actor_user_id).filter(Boolean))) as string[];
  const profileMap = new Map<string, { full_name?: string; email?: string }>();

  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);

    (profiles || []).forEach((p) => profileMap.set(p.id, p));
  }

  const enriched: AuditLogEntry[] = (data || []).map((entry) => {
    const profile = entry.actor_user_id ? profileMap.get(entry.actor_user_id) : undefined;
    return {
      ...entry,
      actor_name: profile?.full_name || null,
      actor_email: profile?.email || null,
    };
  });

  return {
    items: enriched,
    total: count ?? enriched.length,
  };
}
