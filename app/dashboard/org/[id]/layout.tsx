/**
 * app/dashboard/org/[id]/layout.tsx
 * Organization workspace layout — uses immutable UUID, never the slug.
 * Verifies the current user owns the organization identified by [id],
 * then renders the org sidebar and workspace shell.
 */
import type { ReactNode } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import OrgDashboardSidebar from "./OrgDashboardSidebar";
import OrgMobileHeader from "./OrgMobileHeader";

export default async function OrgDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseAdmin();
  const { data: org } = await supabase
    .from("organizers")
    .select("id, name, slug, photo, status, org_type, user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!org) return notFound();

  // Tenant access: owner or delegated via entity_members
  const { checkTenantAccess } = await import("@/lib/entity-auth");
  const access = await checkTenantAccess(user.id, id, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  if (!access.hasAccess) {
    redirect("/dashboard");
  }

  // Counts for contextual nav — Website only if business/site exists
  const [{ count: eventCount }, { count: fundraiserCount }, { count: businessCount }, { count: productCount }, { data: websiteRow }] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("fundraisers").select("id", { count: "exact", head: true }).eq("organizer_id", id).is("deleted_at", null),
    supabase.from("businesses").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("tenant_websites").select("id").eq("tenant_id", id).maybeSingle(),
  ]);
  const hasEvents = (eventCount ?? 0) > 0;
  const hasFundraisers = (fundraiserCount ?? 0) > 0;
  const hasProducts = (businessCount ?? 0) > 0 || (productCount ?? 0) > 0;
  const hasWebsite = (businessCount ?? 0) > 0 || !!websiteRow;

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <OrgDashboardSidebar org={org} hasEvents={hasEvents} hasFundraisers={hasFundraisers} hasProducts={hasProducts} hasWebsite={hasWebsite} />

      {/* Main content area */}
      <main className="min-w-0 flex-1">
        <OrgMobileHeader org={org} hasEvents={hasEvents} hasFundraisers={hasFundraisers} hasProducts={hasProducts} hasWebsite={hasWebsite} />
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8 lg:pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
