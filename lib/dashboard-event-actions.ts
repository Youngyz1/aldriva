import type { DashboardEventRow } from "@/types/dashboard-management";

export type DashboardEventActionId = "checkins" | "scan" | "team" | "edit" | "delete";

type EventActionRole = DashboardEventRow["user_role"];

export function getDashboardEventActionIds(userRole: EventActionRole): DashboardEventActionId[] {
  if (userRole === "ticket_scanner") {
    return ["scan"];
  }

  const actions: DashboardEventActionId[] = ["checkins", "scan", "team"];

  if (!userRole || userRole === "owner") {
    actions.push("edit", "delete");
  }

  return actions;
}

export function canSelectDashboardEventForBulk(row: Pick<DashboardEventRow, "user_role">) {
  return !row.user_role || row.user_role === "owner";
}
