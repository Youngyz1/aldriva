/**
 * app/dashboard/org/[id]/layout.tsx
 * Organization workspace layout — uses immutable UUID, never the slug.
 * Verifies the current user owns the organization identified by [id],
 * then renders the org sidebar and workspace shell.
 */
import type { ReactNode } from "react";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCapabilitiesForBusinesses } from "@/lib/org-dashboard-modules";
import { getApprovalState } from "@/lib/business-approval";
import {
  classifyOrganizerDashboardTypes,
  isOrganizerDashboardBusiness,
} from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { getFullOrgNavItems } from "./org-nav-items";
import OrgDashboardSidebar from "./OrgDashboardSidebar";
import OrgMobileHeader from "./OrgMobileHeader";
import OrgApprovalBanner from "./OrgApprovalBanner";
import { DashboardBottomBar } from "@/components/nav/DashboardBottomBar";

// Opted out of instant-navigation validation: this segment has no shell worth
// streaming. The layout must resolve the session, the tenant row and its access
// before it can redirect/404, and the sidebar, capability nav and approval
// banner all render from the same eight-query batch. A Suspense fallback here
// could only be an empty chrome that flashes before the real nav arrives, and
// a redirect cannot be deferred. Pages below keep their own boundaries.
export const instant = false;

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

  // Raw row samples classify organizer type; offsets and display totals never
  // create Events/Fundraisers/Business navigation.
  // Products has no organizer_id column (owner_id + optional business_id only,
  // migration_37), so the Shop count resolves through the org owner and covers
  // products of ANY kind (business_id irrelevant): creating a business, event,
  // or fundraiser alone never shows Shop.
  const orgUserId = (org as { user_id?: string | null }).user_id ?? null;
  const [
    { data: eventRows },
    { data: fundraiserRows },
    { count: productCount },
    { data: websiteRow },
    { data: businessRows },
    { count: menuSectionCount },
    { count: serviceCount },
    { count: activeServiceCount },
    { count: reservationCount },
    { count: vehicleCount },
    { count: pendingRentalsCount },
  ] = await Promise.all([
    supabase.from("events").select("id, deleted_at").eq("organizer_id", id).is("deleted_at", null).limit(1),
    supabase.from("fundraisers").select("id, deleted_at").eq("organizer_id", id).is("deleted_at", null).limit(1),
    orgUserId
      ? supabase.from("products").select("id", { count: "exact", head: true }).eq("owner_id", orgUserId)
      : Promise.resolve({ count: 0 }),
    supabase.from("tenant_websites").select("id").eq("tenant_id", id).maybeSingle(),
    supabase.from("businesses").select("id, industry, category, business_type, offerings, status").eq("organizer_id", id),
    supabase.from("menu_sections").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organizer_id", id).eq("is_active", true),
    // Missing migration 176 => error => null count => hidden unless gated
    // otherwise; never crashes the layout. Restaurant table reservations only
    // (booking_type='table') — appointment-type general bookings have their
    // own "Bookings" nav signal and never resurrect Reservations for a
    // service-only business.
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("organizer_id", id).eq("booking_type", "table"),
    // Missing migration 224 => error => null count => hidden unless gated by capability
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("organizer_id", id),
    // Missing migration 225 => error => null count => hidden unless gated by capability
    supabase.from("rental_bookings").select("id", { count: "exact", head: true }).eq("organizer_id", id).eq("status", "pending"),
  ]);
  const allBusinessRows = Array.isArray(businessRows) ? businessRows : [];
  const organizerTypes = classifyOrganizerDashboardTypes({
    events: eventRows ?? [],
    fundraisers: fundraiserRows ?? [],
    businesses: allBusinessRows,
  });
  const eligibleBusinessRows = allBusinessRows.filter(isOrganizerDashboardBusiness);
  const cookieStore = await cookies();
  const cookieBusinessId = cookieStore.get(getActiveBusinessCookieName(id))?.value ?? null;
  const activeBusiness = resolveActiveBusiness(eligibleBusinessRows, { cookieBusinessId });
  const hasProducts = (productCount ?? 0) > 0;
  const hasMenuRows = (menuSectionCount ?? 0) > 0;
  const hasServiceRows = (serviceCount ?? 0) > 0;
  const hasActiveServiceRows = (activeServiceCount ?? 0) > 0;
  const hasReservationRows = (reservationCount ?? 0) > 0;
  const hasFleetRows = (vehicleCount ?? 0) > 0;

  // Capability-driven business nav: union across eligible linked businesses.
  // The shared type classifier still gates every business module, so the
  // taxonomy fallback cannot expose a business page by itself.
  const capabilities = getCapabilitiesForBusinesses(
    eligibleBusinessRows as Array<{
      industry?: string | null;
      category?: string | null;
      business_type?: string | null;
    }>
  );
  const offerings = Array.from(
    new Set(
      eligibleBusinessRows.flatMap((row) =>
        Array.isArray((row as { offerings?: unknown }).offerings)
          ? ((row as { offerings: unknown[] }).offerings.filter(
              (key): key is string => typeof key === "string"
            ))
          : []
      )
    )
  );
  const navOpts = {
    organizerTypes,
    hasProducts,
    hasMenuRows,
    hasServiceRows,
    hasActiveServiceRows,
    hasReservationRows,
    hasFleetRows,
    capabilities,
    offerings,
    pendingRentalsCount: pendingRentalsCount ?? 0,
  };

  // Derive approval state from linked business statuses (gate for publish/orders).
  // Sidebar keeps showing Menu/Website while pending — only the banner changes.
  const approvalState = getApprovalState(
    allBusinessRows.map(
      (row) => (row as { status?: string | null }).status ?? ""
    )
  );

  // Computed once, shared by the desktop sidebar (via OrgDashboardSidebar's
  // own call with the same opts) and the mobile More sheet (passed down
  // through DashboardBottomBar) — one function, so the two surfaces cannot
  // show different workspace items.
  const base = `/dashboard/org/${id}`;
  const navItems = getFullOrgNavItems(base, navOpts);

  // One-time dev check (never in production): list what this org would lose
  // versus today's always-show Services/Menu, so test data can be reviewed
  // before the capability rules are trusted.
  if (process.env.NODE_ENV !== "production") {
    const today = [
      "Overview",
      ...(allBusinessRows.length > 0 || websiteRow ? ["Website"] : []),
      ...(organizerTypes.hasEvents ? ["Events"] : []),
      ...(organizerTypes.hasFundraisers ? ["Fundraisers"] : []),
      ...(hasProducts ? ["Shop"] : []),
      "Services",
      "Menu",
      "Reviews",
      "Analytics",
      "Settings",
    ];
    const next = navItems.map((item) => item.label);
    const lost = today.filter((label) => !next.includes(label));
    if (lost.length > 0) {
      console.info(
        `[org-nav] org ${id} would lose nav items vs today: ${lost.join(", ")} ` +
           `(capabilities: ${capabilities.join(", ") || "none"}; ` +
           `menuRows: ${hasMenuRows}; serviceRows: ${hasServiceRows})`
      );
    }
    if (websiteRow && !organizerTypes.hasBusiness) {
      console.info(`[org-nav] org ${id} has a website row without an eligible business; Website is hidden`);
    }
  }

  const bottomBarCaps: string[] = [...capabilities];
  if (organizerTypes.hasEvents && !bottomBarCaps.includes("EVENTS")) {
    bottomBarCaps.push("EVENTS");
  }
  if (organizerTypes.hasFundraisers && !bottomBarCaps.includes("DONATIONS")) {
    bottomBarCaps.push("DONATIONS");
  }

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <OrgDashboardSidebar org={org} organizerTypes={organizerTypes} hasProducts={hasProducts} hasMenuRows={hasMenuRows} hasServiceRows={hasServiceRows} hasActiveServiceRows={hasActiveServiceRows} hasReservationRows={hasReservationRows} hasFleetRows={hasFleetRows} capabilities={capabilities} offerings={offerings} pendingRentalsCount={pendingRentalsCount ?? 0} />

      {/* Main content area */}
      <main className="min-w-0 flex-1">
        <OrgMobileHeader
          org={org}
          businesses={eligibleBusinessRows}
          activeBusinessId={activeBusiness?.id}
        />
        {eligibleBusinessRows.length > 1 && (
          <div className="hidden lg:flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-2.5">
            <span className="text-xs font-semibold text-zinc-500">Active Business</span>
            <BusinessSwitcher
              organizerId={id}
              businesses={eligibleBusinessRows}
              activeBusinessId={activeBusiness?.id}
            />
          </div>
        )}
        <OrgApprovalBanner approvalState={approvalState} />
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8 pb-[calc(var(--bottom-bar-h)+1.5rem)] lg:pb-6">
          {children}
        </div>
        <DashboardBottomBar
          orgId={id}
          hasLiveDomain={organizerTypes.hasBusiness || organizerTypes.hasEvents || organizerTypes.hasFundraisers}
          capabilities={bottomBarCaps}
          pendingRentalsCount={pendingRentalsCount ?? 0}
          navItems={navItems}
        />
      </main>
    </div>
  );
}

