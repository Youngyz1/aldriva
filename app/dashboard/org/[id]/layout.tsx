/**
 * app/dashboard/org/[id]/layout.tsx
 * Organization workspace layout — uses immutable UUID, never the slug.
 * Verifies the current user owns the organization identified by [id],
 * then renders the org sidebar and workspace shell.
 */
import type { ReactNode } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import OrgDashboardSidebar from "./OrgDashboardSidebar";

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

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
