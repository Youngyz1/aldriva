/**
 * app/admin/workforce/office/page.tsx — Stage 19: 3D office (visualization ONLY).
 *
 * Another VIEW of the same workforce state: admin-gated Server Component,
 * signed-in RLS reads through the EXISTING modules (never modified here),
 * minimal JSON snapshot to a client component. No writes, no actions, no
 * service-role, no three.js on the server path.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { fetchCommandCenterData } from "@/lib/workforce/command-center";
import { buildOfficeSnapshot } from "@/lib/workforce/office";
import { OfficeView } from "./OfficeView";

export default async function WorkforceOfficePage() {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();

  const supabase = await createSupabaseServer();
  // Platform-wide admin view (tenantId null), same source as Command Center.
  const raw = await fetchCommandCenterData(supabase, null);
  const snapshot = buildOfficeSnapshot(raw);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-2xl text-white">AI Workforce — Office</h1>
        <p className="text-sm text-zinc-400">
          A live view of stored workforce state. Read-only: nothing here can
          start, approve or change any work.
        </p>
      </div>
      <OfficeView snapshot={snapshot} />
    </div>
  );
}
