/**
 * app/dashboard/org/[id]/layout.tsx
 * Organization workspace layout — uses immutable UUID, never the slug.
 * Verifies the current user owns the organization identified by [id],
 * then renders the org sidebar and workspace shell.
 */
import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import OrgDashboardSidebar from "./OrgDashboardSidebar";
import OrgMobileNav from "./OrgMobileNav";

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

  if (!org) return notFound();

  // Only the owning user can access the org workspace
  if (org.user_id !== user.id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <OrgDashboardSidebar org={org} />

      {/* Main content area — plain flow (no overflow) so the sticky
          sidebars/navs keep sticking to the viewport instead of a nested
          scroll container. */}
      <main className="min-w-0 flex-1">
        {/* Mobile org bottom bar (the account-level DashboardMobileNav bar
            from the parent dashboard layout docks at the screen edge below
            this one). Suspense covers useSearchParams inside the pill strip
            during SSR; the fallback matches the bar so there's no shift. */}
        <Suspense
          fallback={
            <div aria-hidden className="fixed bottom-[calc(69px+env(safe-area-inset-bottom))] left-0 right-0 h-[69px] border-t border-zinc-200 bg-white lg:hidden" />
          }
        >
          <OrgMobileNav orgId={id} />
        </Suspense>
        {/* Bottom padding reserves room for this layout's fixed org bar
            (69px) below lg. Combined with the parent dashboard wrapper's
            69px + safe-area, org pages clear both stacked bars. */}
        <div className="mx-auto max-w-6xl px-4 pb-[69px] pt-6 sm:px-6 sm:pb-[69px] lg:px-8 lg:pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
