import Link from "next/link";
import AppSidebar from "@/components/nav/AppSidebar";
import { dashboardNavGroups } from "./nav-items";
import { MyOrganizersDropdown } from "@/components/dashboard/MyOrganizersDropdown";

export default function DashboardSidebar() {
  return (
    <AppSidebar
      groups={dashboardNavGroups}
      navAriaLabel="Dashboard navigation"
      header={
        <div className="px-3 pt-5 space-y-2">
          <Link href="/" className="mb-1 flex items-center gap-3 px-2">
            <span className="text-lg font-black text-zinc-900">Aldriva</span>
          </Link>
          <Link
            href="/dashboard/create"
            className="block rounded-xl bg-brand-700 px-3 py-2.5 text-center text-sm font-black text-white transition hover:bg-brand-800"
          >
            + Create New
          </Link>
          <MyOrganizersDropdown variant="sidebar" />
        </div>
      }
      footer={
        <div className="p-3">
          <Link
            href="/about"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            Help &amp; Support
          </Link>
        </div>
      }
    />
  );
}
