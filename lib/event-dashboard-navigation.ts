export type EventUserRole = "owner" | "event_manager" | "ticket_scanner" | null;

export type EventSubNavTabId =
  | "overview"
  | "operations"
  | "checkins"
  | "scan"
  | "team"
  | "edit"
  | "seating"
  | "guests"
  | "memories"
  | "ticket-design"
  | "invitation-page";

export type EventSubNavTab = {
  id: EventSubNavTabId;
  label: string;
  href: string;
};

export function getEventSubNavTabs(
  eventId: string,
  userRole: EventUserRole,
  opts?: { isInvitationKind?: boolean }
): EventSubNavTab[] {
  const isOrganizer = userRole === "owner";
  const isEventManager = userRole === "event_manager";
  const canManageEvent = isOrganizer || isEventManager;
  // Round 4 Rule 1: invitation tooling tabs exist only for invitation-kind
  // events. Memories serve every kind (photos are not invitations).
  // Callers that do not pass the kind keep the previous full tab set.
  const showInvitationTabs = opts?.isInvitationKind !== false;

  const tabs: EventSubNavTab[] = [];

  tabs.push({
    id: "overview",
    label: "Overview",
    href: `/dashboard/events/${eventId}/overview`,
  });

  if (canManageEvent) {
    tabs.push({
      id: "operations",
      label: "Operations",
      href: `/dashboard/events/${eventId}/operations`,
    });
  }

  if (canManageEvent) {
    tabs.push({
      id: "checkins",
      label: "Check-Ins & Roster",
      href: `/dashboard/events/${eventId}/checkins`,
    });
  }

  if (userRole) {
    tabs.push({
      id: "scan",
      label: "Door Scanner",
      href: `/dashboard/events/${eventId}/scan`,
    });
  }

  if (canManageEvent && showInvitationTabs) {
    tabs.push({
      id: "guests",
      label: "Guests & Invites",
      href: `/dashboard/events/${eventId}/guests`,
    });
  }

  if (canManageEvent) {
    tabs.push({
      id: "memories",
      label: "Memories",
      href: `/dashboard/events/${eventId}/memories`,
    });
  }

  if (canManageEvent) {
    tabs.push({
      id: "ticket-design",
      label: "Ticket Design",
      href: `/dashboard/events/${eventId}/ticket-design`,
    });
  }

  if (canManageEvent && showInvitationTabs) {
    tabs.push({
      id: "invitation-page",
      label: "Invitation Page",
      href: `/dashboard/events/${eventId}/invitation-page`,
    });
  }

  if (canManageEvent) {
    tabs.push({
      id: "seating",
      label: "Seating",
      href: `/dashboard/events/${eventId}/seating`,
    });
  }

  if (canManageEvent) {
    tabs.push({
      id: "team",
      label: "Team & Staff",
      href: `/dashboard/events/${eventId}/team`,
    });
  }

  if (isOrganizer) {
    tabs.push({
      id: "edit",
      label: "Edit Details",
      href: `/events/edit/${eventId}`,
    });
  }

  return tabs;
}

export function canShowEventPublicPage(userRole: EventUserRole, eventSlug?: string | null) {
  return userRole === "owner" && Boolean(eventSlug);
}
