import Link from "next/link";
import AppSidebar from "@/components/nav/AppSidebar";
import { dashboardNavGroups } from "./nav-items";

export default function DashboardSidebar() {
  return (
    <AppSidebar
      groups={dashboardNavGroups}
      navAriaLabel="Dashboard navigation"
      header={
        <div className="px-3 pt-5">
          <Link href="/" className="mb-5 flex items-center gap-3 px-2">
            <span className="text-lg font-black text-white">Aldriva</span>
          </Link>
          <Link
            href="/create-organizer"
            className="mb-2 block rounded-xl bg-brand-700 px-3 py-2.5 text-center text-sm font-black text-white transition hover:bg-brand-800"
          >
            + New Organization
          </Link>
        </div>
      }
      footer={
        <div className="p-3">
          <Link
            href="/about"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Help &amp; Support
          </Link>
        </div>
      }
    />
  );
}
