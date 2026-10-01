import { redirect } from "next/navigation";

// /dashboard/organizations/[slug] → redirect to overview
export default async function OrgDashboardRoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/dashboard/organizations/${slug}/overview`);
}
