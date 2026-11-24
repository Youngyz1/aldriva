// This layout now admits two access scopes: organizer-level entity members
// (unchanged) AND staff-scope users (an active staff_members row, any role,
// not an entity_member). A staff-scope user sees only the "Staff" nav item
// below. Every page under this folder MUST perform its own authorization
// check -- do not assume reaching a page here means the user may act on it.
// This was true even before staff-scope access existed (each existing page
// already re-checks independently), but it is now load-bearing: a
// staff-scope user passes this layout and would reach any page's content if
// that page's own check did not independently reject them.
import { notFound } from "next/navigation";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { ManagementShell } from "@/components/management/ManagementShell";
import { getModulesForBusiness } from "@/lib/business-dashboard-modules";
import { getRolesAccess } from "@/lib/staff/roles-access-server";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanAccessBusinessStaffArea(id);
  if (!auth.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[business-layout] notFound: auth failed for business ${id}`);
    }
    return notFound();
  }
  const isStaffOnly = auth.scope === "staff";
  // Roles nav item: shown only when the same rule the page enforces says the
  // caller can view roles. Any error fails closed (no item); the page itself
  // still gates with notFound().
  let rolesItems: { label: string; href: string; icon: string }[] = [];
  try {
    const rolesAccess = await getRolesAccess(id, auth.scope === "organizer");
    if (rolesAccess.canView) {
      rolesItems = [{ label: "Roles", href: `/dashboard/businesses/${id}/roles`, icon: "UserCog" }];
    }
  } catch {
    rolesItems = [];
  }
  const admin = createSupabaseAdmin();
  const { data: b } = await admin
    .from("businesses")
    .select("id, name, industry, category, business_type, offerings, organizer_id")
    .eq("id", id)
    .maybeSingle();
  if (!b) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[business-layout] notFound: no business row for id=${id}`);
    }
    return notFound();
  }

  const base = `/dashboard/businesses/${id}`;
  const orgBase = b.organizer_id ? `/dashboard/org/${b.organizer_id}` : null;
  const capabilityModules = getModulesForBusiness(b.industry, b.category, b.business_type, b.offerings);
  const capabilityKeys = new Set(capabilityModules.map((m) => m.key));

  // For items that live in the org workspace (menu, website), redirect to the
  // org route when an organizer_id is available. Items with no existing page
  // file and no org fallback are omitted (routeExists: false pattern).
  const maybeItem = (key: string, label: string, icon: string): { label: string; href: string; icon: string } | null => {
    if (!capabilityKeys.has(key)) return null;
    // Menu and Website live under the org workspace, not the business shell.
    if (key === "menu" && orgBase) return { label, href: `${orgBase}/menu`, icon };
    if (key === "website" && orgBase) return { label, href: `${orgBase}/website/new`, icon };
    return { label, href: `${base}/${key}`, icon };
  };

  const dynamicItems = isStaffOnly
    ? []
    : ([
        maybeItem("products", "Products", "ShoppingBag"),
        maybeItem("menu", "Menu", "Utensils"),
        maybeItem("orders", "Orders", "Store"),
        maybeItem("reservations", "Reservations", "CalendarCheck"),
        maybeItem("bookings", "Bookings", "CalendarDays"),
        maybeItem("services", "Services", "Briefcase"),
        maybeItem("vehicles", "Vehicles", "Car"),
        maybeItem("rooms", "Rooms", "BedDouble"),
        maybeItem("branches", "Branches", "MapPin"),
        maybeItem("inventory", "Inventory", "Boxes"),
        maybeItem("customers", "Customers", "Users"),
        maybeItem("staff", "Staff", "UserCog"),
        maybeItem("reviews", "Reviews", "Star"),
        maybeItem("analytics", "Analytics", "BarChart2"),
      ].filter(Boolean) as { label: string; href: string; icon: string }[]);

  // Staff-scope users (not organizer-level) see only the Staff nav item --
  // do not let them into the rest of the business shell.
  const navGroups = [
    {
      items: isStaffOnly
        ? [
            { label: "Staff", href: `${base}/staff`, icon: "UserCog" },
            { label: "My assignments", href: `${base}/my-assignments`, icon: "UserCog" },
            ...rolesItems,
          ]
        : [
            { label: "Overview", href: `${base}/overview`, icon: "LayoutDashboard" },
            ...dynamicItems,
            ...rolesItems,
            { label: "Settings", href: `${base}/edit`, icon: "Settings" },
          ],
    },
  ];
  return (
    <ManagementShell entityLabel="Business" entityName={b.name} backHref="/dashboard/businesses" navGroups={navGroups} hideBackLink={isStaffOnly}>
      {children}
    </ManagementShell>
  );
}
