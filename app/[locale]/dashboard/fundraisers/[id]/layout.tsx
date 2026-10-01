import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { ManagementShell } from "@/components/management/ManagementShell";
import FundraiserSwitcher from "@/components/fundraisers/FundraiserSwitcher.client";

export default async function FundraiserLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data: f } = await admin.from("fundraisers").select("id, title, organizer_id").eq("id", id).maybeSingle();
  if (!f) return notFound();

  const base = `/dashboard/fundraisers/${id}`;
  const navGroups = [
    {
      items: [
        { label: "Overview", href: `${base}/overview`, icon: "LayoutDashboard" },
        { label: "Donations", href: `${base}/donations`, icon: "Heart" },
        { label: "Donors", href: `${base}/donors`, icon: "Users" },
        { label: "Beneficiaries", href: `${base}/beneficiaries`, icon: "HeartHandshake" },
        { label: "Updates", href: `${base}/updates`, icon: "Megaphone" },
        { label: "Analytics", href: `${base}/analytics`, icon: "BarChart2" },
        { label: "Settings", href: `${base}/settings`, icon: "Settings" },
      ],
    },
  ];

  // — scope switcher to current organizer (or personal)
  let switcherItems: { id: string; title: string; status?: string | null }[] = [];
  try {
    if (f.organizer_id) {
      const { data } = await admin
        .from("fundraisers")
        .select("id, title, status")
        .eq("organizer_id", f.organizer_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      switcherItems = (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title ?? "Untitled"), status: r.status as string | null }));
    } else {
      // personal: organizer_id IS NULL and owned by current user
      const { data } = await admin
        .from("fundraisers")
        .select("id, title, status")
        .eq("user_id", auth.userId)
        .is("organizer_id", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      switcherItems = (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title ?? "Untitled"), status: r.status as string | null }));
    }
  } catch {}

  const headerSlot = (
    <div className="px-3 pt-5 space-y-3">
      <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
      </Link>
      <FundraiserSwitcher currentId={id} items={switcherItems} variant="light" />
    </div>
  );

  const mobileHeaderSlot = <FundraiserSwitcher currentId={id} items={switcherItems} variant="light" />;

  return (
    <ManagementShell
      entityLabel="Fundraiser"
      entityName={f.title ?? "Fundraiser"}
      backHref="/dashboard"
      navGroups={navGroups}
      headerSlot={headerSlot}
      mobileHeaderSlot={mobileHeaderSlot}
    >
      {children}
    </ManagementShell>
  );
}
