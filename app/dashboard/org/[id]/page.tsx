import { redirect } from "next/navigation";

// /dashboard/org/[id] → redirect to overview
export default async function OrgDashboardRoot({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/org/${id}/overview`);
}
