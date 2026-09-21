import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { ManagementShell } from "@/components/management/ManagementShell";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data: b } = await admin.from("businesses").select("id, name").eq("id", id).maybeSingle();
  if (!b) return notFound();
  const base = `/dashboard/businesses/${id}`;
  const navGroups = [
    {
      items: [
        { label: "Overview", href: `${base}/overview`, icon: "LayoutDashboard" },
        { label: "Products", href: `${base}/products`, icon: "ShoppingBag" },
        { label: "Orders", href: `${base}/orders`, icon: "Store" },
        { label: "Reviews", href: `${base}/reviews`, icon: "Star" },
        { label: "Analytics", href: `${base}/analytics`, icon: "BarChart2" },
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
