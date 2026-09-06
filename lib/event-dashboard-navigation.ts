export type EventUserRole = "owner" | "event_manager" | "ticket_scanner" | null;

export type EventSubNavTabId = "operations" | "checkins" | "scan" | "team" | "edit" | "seating" | "guests";

export type EventSubNavTab = {
  id: EventSubNavTabId;
  label: string;
  href: string;
};

export function getEventSubNavTabs(eventId: string, userRole: EventUserRole): EventSubNavTab[] {
  const isOrganizer = userRole === "owner";
  const isEventManager = userRole === "event_manager";
  const canManageEvent = isOrganizer || isEventManager;

  const tabs: EventSubNavTab[] = [];

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

  if (canManageEvent) {
    tabs.push({
      id: "guests",
      label: "Guests & Invites",
      href: `/dashboard/events/${eventId}/guests`,
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
