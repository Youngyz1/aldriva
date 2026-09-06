import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { calculateEventOperationalMetrics } from "@/lib/event-metrics";
import { getEventAuditHistory } from "@/lib/event-audit";
import OperationsDashboardClient from "./OperationsDashboardClient";

export default async function EventOperationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/events/${eventId}/operations`);
  }

  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) {
    redirect(`/dashboard/events/${eventId}/scan`);
  }

  const metrics = await calculateEventOperationalMetrics(eventId);
  const auditHistory = await getEventAuditHistory(eventId, { limit: 20 });

  return (
    <OperationsDashboardClient
      eventId={eventId}
      initialMetrics={metrics}
      initialAudit={auditHistory.items}
    />
  );
}
