import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getAdaptiveDashboardData } from "@/lib/dashboard-activity";
import AdaptiveDashboardView from "@/components/dashboard/adaptive/AdaptiveDashboardView";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user, organizers, organizerIds } = ctx;
  const displayName = (user.user_metadata?.display_name as string | undefined)?.trim() || "User";

  const data = await getAdaptiveDashboardData({ userId: user.id, organizerIds });

  return <AdaptiveDashboardView displayName={displayName} organizers={organizers} data={data} />;
}
