import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { ManagementShell } from "@/components/management/ManagementShell";
import { getModulesForBusiness } from "@/lib/business-dashboard-modules";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data: b } = await admin.from("businesses").select("id, name, industry, category, business_type").eq("id", id).maybeSingle();
  if (!b) return notFound();
  const base = `/dashboard/businesses/${id}`;
  const capabilityModules = getModulesForBusiness(b.industry, b.category, b.business_type);
  const capabilityKeys = new Set(capabilityModules.map((m) => m.key));
  // map module key to nav item - keep existing routes where they exist, others are capability gated but may not have pages yet
  const maybeItem = (key: string, label: string, icon: string) =>
    capabilityKeys.has(key) ? { label, href: `${base}/${key}`, icon } : null;
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

  // Fallback: if taxonomy yields no modules (e.g. Custom Business with minimal caps), ensure at least Products/Reviews if present
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
