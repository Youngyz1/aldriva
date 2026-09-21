import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getMyThingsData } from "@/lib/my-things";
import { MyThingsView } from "@/components/dashboard/MyThingsView";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  const displayName = (user.user_metadata?.display_name as string | undefined)?.trim() || "User";

  const { sections, hasAny } = await getMyThingsData(ctx);

  return <MyThingsView displayName={displayName} sections={sections} hasAny={hasAny} />;
}
