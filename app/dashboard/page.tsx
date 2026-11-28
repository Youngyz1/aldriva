import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getMyThingsData } from "@/lib/my-things";
import { MyThingsView } from "@/components/dashboard/MyThingsView";
import { createSupabaseServer } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  const displayName = (user.user_metadata?.display_name as string | undefined)?.trim() || "User";

  const { sections, hasAny, accountData } = await getMyThingsData(ctx);

  // Staff-only landing: a user with nothing of their own here (no organizer,
  // no business) but an active staff record goes straight to the staff area.
  // Anyone who owns or manages something is never redirected. Uses the
  // caller's own session; staff_members' self-read policy allows this lookup.
  if (!hasAny) {
    const supabase = await createSupabaseServer();
    const { data: staffRows } = await supabase
      .from("staff_members")
      .select("business_id")
      .eq("auth_user_id", user.id)
      .eq("status", "active")
      .limit(1);
    const businessId = staffRows?.[0]?.business_id;
    if (businessId) redirect(`/dashboard/businesses/${businessId}/staff`);
  }

  return (
    <MyThingsView
      displayName={displayName}
      sections={sections}
      hasAny={hasAny}
      accountData={accountData}
    />
  );
}
