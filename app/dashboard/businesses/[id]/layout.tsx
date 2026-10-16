import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { ManagementShell } from "@/components/management/ManagementShell";
import { getModulesForBusiness } from "@/lib/business-dashboard-modules";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[business-layout] notFound: auth failed for business ${id}`);
    }
    return notFound();
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

  const dynamicItems = [
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
  ].filter(Boolean) as { label: string; href: string; icon: string }[];

  // Always include Overview and Settings regardless of capabilities
  const navGroups = [
    {
      items: [
        { label: "Overview", href: `${base}/overview`, icon: "LayoutDashboard" },
        ...dynamicItems,
        { label: "Settings", href: `${base}/edit`, icon: "Settings" },
      ],
    },
  ];
  return (
    <ManagementShell entityLabel="Business" entityName={b.name} backHref="/dashboard/businesses" navGroups={navGroups}>
      {children}
    </ManagementShell>
  );
}
