/**
 * app/admin/layout.tsx
 * Admin section shell — CSS grid ([sidebar] [minmax(0,1fr)]), collapsible
 * sidebar, mobile off-canvas nav. Calls requireAdmin() to block non-admins.
 * Phase 2: Stripe-style calm sheet — no max-width cap, no boxes in boxes.
 */

import { cookies, headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { ReactNode } from "react";
import {
  AdminSidebar,
  AdminMobileNav,
} from "@/components/admin/AdminSidebar";
import { ADMIN_SIDEBAR_COOKIE } from "@/components/admin/admin-sidebar-cookie";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // proxy.ts already verifies admin role for every /admin/* request and
  // marks it with this header — skip the redundant Supabase round-trip on
  // that (expected) path. If the header is ever missing, fall back to the
  // full check so a non-admin can never slip through.
  const headerList = await headers();
  if (headerList.get("x-admin-verified") !== "1") {
    await requireAdmin();
  }

  // Collapse preference persisted in a cookie (written client-side on toggle)
  // and read here server-side, so the first paint already matches — no flash.
  const cookieStore = await cookies();
  const defaultCollapsed =
    cookieStore.get(ADMIN_SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      {/* No vertical padding on this grid row by design: the sticky sidebar
          cannot cross its parent's padding box, so parent top/bottom padding
          would shove it up/down at the scroll extremes. Breathing room lives
          on the content column (py-6) and the sidebar's own p-3 instead.
          No max-width cap: the admin uses the available viewport width. */}
      <div className="grid w-full grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:px-8">
        <AdminSidebar defaultCollapsed={defaultCollapsed} />

        {/* Content column — the mobile nav shows below lg; `children`
            render ONCE here (shared across breakpoints) so admin pages don't
            mount their client components twice. */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 py-6">
          <AdminMobileNav />

          {/* Shared page content */}
          <section className="min-w-0 flex-1">{children}</section>
        </div>
      </div>
    </div>
  );
}
