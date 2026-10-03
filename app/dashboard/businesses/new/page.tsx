import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import NewBusinessFormClient from "./NewBusinessFormClient";

export default async function NewBusinessPage() {
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const tenantId = ctx.organizerId || ctx.organizer?.id || ctx.organizers[0]?.id || ctx.user.id;

  return <NewBusinessFormClient tenantId={tenantId} />;
}
