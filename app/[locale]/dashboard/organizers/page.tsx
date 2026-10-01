import { redirect } from "next/navigation";

export default async function DashboardOrganizersRedirectPage() {
  redirect("/dashboard/organizations");
}
