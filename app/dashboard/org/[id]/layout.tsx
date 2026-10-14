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
import { getCapabilitiesForBusinesses } from "@/lib/org-dashboard-modules";
import { getApprovalState } from "@/lib/business-approval";
import { getOrgNavItems } from "./org-nav-items";
import OrgDashboardSidebar from "./OrgDashboardSidebar";
import OrgMobileHeader from "./OrgMobileHeader";
import OrgApprovalBanner from "./OrgApprovalBanner";

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

  if (!org) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[org-layout] notFound: no organizer row for id=${id}`);
    }
    return notFound();
  }

  // Tenant access: owner or delegated via entity_members
  const { checkTenantAccess } = await import("@/lib/entity-auth");
  const access = await checkTenantAccess(user.id, id, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  if (!access.hasAccess) {
    redirect("/dashboard");
  }

  // Counts for contextual nav — Website only if business/site exists.
  // Products has no organizer_id column (owner_id + optional business_id only,
  // migration_37), so the Shop count resolves through the org owner and covers
  // products of ANY kind (business_id irrelevant): creating a business, event,
  // or fundraiser alone never shows Shop.
  const orgUserId = (org as { user_id?: string | null }).user_id ?? null;
  const [
    { count: eventCount },
    { count: fundraiserCount },
    { count: businessCount },
    { count: productCount },
    { data: websiteRow },
    { data: businessRows },
    { count: menuSectionCount },
    { count: serviceCount },
    { count: reservationCount },
  ] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("fundraisers").select("id", { count: "exact", head: true }).eq("organizer_id", id).is("deleted_at", null),
    supabase.from("businesses").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    orgUserId
      ? supabase.from("products").select("id", { count: "exact", head: true }).eq("owner_id", orgUserId)
      : Promise.resolve({ count: 0 }),
    supabase.from("tenant_websites").select("id").eq("tenant_id", id).maybeSingle(),
    supabase.from("businesses").select("id, industry, category, business_type, offerings, status").eq("organizer_id", id),
    supabase.from("menu_sections").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    // Missing migration 176 => error => null count => hidden unless gated
    // otherwise; never crashes the layout.
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("organizer_id", id),
  ]);
  const hasEvents = (eventCount ?? 0) > 0;
  const hasFundraisers = (fundraiserCount ?? 0) > 0;
  const hasProducts = (productCount ?? 0) > 0;
  const hasWebsite = (businessCount ?? 0) > 0 || !!websiteRow;
  const hasMenuRows = (menuSectionCount ?? 0) > 0;
  const hasServiceRows = (serviceCount ?? 0) > 0;
  const hasReservationRows = (reservationCount ?? 0) > 0;

  // Capability-driven nav: union across every linked business (an org with
  // several businesses sees each type's items). No linked business → the
  // taxonomy fallback, which gates nothing catalog-related.
  const capabilities = getCapabilitiesForBusinesses(
    (Array.isArray(businessRows) ? businessRows : []) as Array<{
      industry?: string | null;
      category?: string | null;
      business_type?: string | null;
    }>
  );
  const offerings = Array.from(
    new Set(
      (Array.isArray(businessRows) ? businessRows : []).flatMap((row) =>
        Array.isArray((row as { offerings?: unknown }).offerings)
          ? ((row as { offerings: unknown[] }).offerings.filter(
              (key): key is string => typeof key === "string"
            ))
          : []
      )
    )
  );
  const navOpts = {
    hasEvents,
    hasFundraisers,
    hasProducts,
    hasWebsite,
    hasMenuRows,
    hasServiceRows,
    hasReservationRows,
    capabilities,
    offerings,
  };

  // Derive approval state from linked business statuses (gate for publish/orders).
  // Sidebar keeps showing Menu/Website while pending — only the banner changes.
  const approvalState = getApprovalState(
    (Array.isArray(businessRows) ? businessRows : []).map(
      (row) => (row as { status?: string | null }).status ?? ""
    )
  );

  // One-time dev check (never in production): list what this org would lose
  // versus today's always-show Services/Menu, so test data can be reviewed
  // before the capability rules are trusted.
  if (process.env.NODE_ENV !== "production") {
    const today = getOrgNavItems(`/dashboard/org/${id}`, {
      hasEvents,
      hasFundraisers,
      hasProducts,
      hasWebsite,
    }).map((item) => item.label);
    const next = getOrgNavItems(`/dashboard/org/${id}`, navOpts).map((item) => item.label);
    const lost = today.filter((label) => !next.includes(label));
    if (lost.length > 0) {
      console.info(
        `[org-nav] org ${id} would lose nav items vs today: ${lost.join(", ")} ` +
           `(capabilities: ${capabilities.join(", ") || "none"}; ` +
           `menuRows: ${hasMenuRows}; serviceRows: ${hasServiceRows})`
      );
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <OrgDashboardSidebar org={org} hasEvents={hasEvents} hasFundraisers={hasFundraisers} hasProducts={hasProducts} hasWebsite={hasWebsite} hasMenuRows={hasMenuRows} hasServiceRows={hasServiceRows} hasReservationRows={hasReservationRows} capabilities={capabilities} offerings={offerings} />

      {/* Main content area */}
      <main className="min-w-0 flex-1">
        <OrgMobileHeader org={org} hasEvents={hasEvents} hasFundraisers={hasFundraisers} hasProducts={hasProducts} hasWebsite={hasWebsite} hasMenuRows={hasMenuRows} hasServiceRows={hasServiceRows} hasReservationRows={hasReservationRows} capabilities={capabilities} offerings={offerings} />
        <OrgApprovalBanner approvalState={approvalState} />
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8 lg:pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
