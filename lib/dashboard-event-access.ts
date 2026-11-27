/**
 * Pure ownership/role decision shared by dashboard event mutation routes.
 *
 * Personal events have organizer_id = NULL and are owned through events.user_id.
 * Organizer events remain governed by the caller's organizer membership role so
 * a matching user_id can never bypass the organizer role tier.
 */

export type DashboardEventAccessRecord = {
  id: string;
  organizer_id: string | null;
  user_id: string | null;
};

export type DashboardEventAccessContext = {
  userId: string;
  organizerIds: readonly string[];
  organizerRoles: Readonly<Record<string, string | null | undefined>>;
  requiredRoles: readonly string[];
  /**
   * Delete is allowed for the owner of a personal event. Content-write actions
   * keep the organizer-only behavior that predates personal-event deletion.
   */
  allowPersonalOwner?: boolean;
};

export type DashboardEventAccessDecision = "allowed" | "not_found" | "forbidden";

export function decideDashboardEventAccess(
  event: DashboardEventAccessRecord,
  context: DashboardEventAccessContext
): DashboardEventAccessDecision {
  if (!event.organizer_id) {
    if (context.allowPersonalOwner && event.user_id === context.userId) {
      return "allowed";
    }
    return "not_found";
  }

  if (!context.organizerIds.includes(event.organizer_id)) {
    return "not_found";
  }

  const role = context.organizerRoles[event.organizer_id];
  if (!role || !context.requiredRoles.includes(role)) {
    return "forbidden";
  }

  return "allowed";
}
