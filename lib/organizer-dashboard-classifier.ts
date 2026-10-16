/**
 * Shared row-existence classifier for organizer dashboard surfaces.
 * Event/fundraiser statuses do not affect ownership: draft rows still count.
 */

export interface OrganizerDashboardRow {
  status?: string | null;
  deleted_at?: string | null;
}

export interface OrganizerDashboardTypeFlags {
  hasEvents: boolean;
  hasFundraisers: boolean;
  hasBusiness: boolean;
  isNone: boolean;
}

export interface OrganizerDashboardRows {
  events: readonly OrganizerDashboardRow[];
  fundraisers: readonly OrganizerDashboardRow[];
  businesses: readonly OrganizerDashboardRow[];
}

/** A business is present unless it is soft-deleted or explicitly archived. */
export function isOrganizerDashboardBusiness(row: OrganizerDashboardRow): boolean {
  return row.deleted_at == null && row.status?.toLowerCase() !== "archived";
}

/**
 * Classify from persisted rows only. Display offsets, ticket counts and
 * fundraising totals must never make an organizer appear to own that type.
 */
export function classifyOrganizerDashboardTypes(
  rows: OrganizerDashboardRows,
): OrganizerDashboardTypeFlags {
  const hasEvents = rows.events.some((row) => row.deleted_at == null);
  const hasFundraisers = rows.fundraisers.some((row) => row.deleted_at == null);
  const hasBusiness = rows.businesses.some(isOrganizerDashboardBusiness);

  return {
    hasEvents,
    hasFundraisers,
    hasBusiness,
    isNone: !hasEvents && !hasFundraisers && !hasBusiness,
  };
}
