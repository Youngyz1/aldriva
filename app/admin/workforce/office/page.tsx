/**
 * app/admin/workforce/office/page.tsx — Stage 19: 3D office (visualization ONLY).
 *
 * Another VIEW of the same workforce state: admin-gated Server Component,
 * signed-in RLS reads through the EXISTING modules (never modified here),
 * minimal JSON snapshot to a client component. No writes, no actions, no
 * service-role, no three.js on the server path.
 *
 * Stage 21 (P3): ?agent=<id> selects an agent (router.replace, no scroll);
 * the panel renders server-side from searchParams via the per-agent helper.
 * Unknown ids resolve null and render no panel (no error leak).
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { fetchCommandCenterData } from "@/lib/workforce/command-center";
import { buildOfficeSnapshot } from "@/lib/workforce/office";
import { fetchAgentPanel } from "@/lib/workforce/agent-detail";
import { isAgentIdShape } from "@/lib/workforce/agents";
import PageHeader from "@/components/admin/PageHeader";
import { OfficeView } from "./OfficeView";
import { AgentPanel } from "./AgentPanel";

export default async function WorkforceOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();
  const { agent: agentParam } = await searchParams;

  const supabase = await createSupabaseServer();
  // Platform-wide admin view (tenantId null), same source as Command Center.
  const raw = await fetchCommandCenterData(supabase, null);
  const snapshot = buildOfficeSnapshot(raw);
  // Selection panel: UUID-shaped + registry-present only, else no panel.
  const panel = agentParam && isAgentIdShape(agentParam) ? await fetchAgentPanel(agentParam, supabase) : null;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="AI Workforce"
        title="Office"
        description="A live view of stored workforce state. Read-only: nothing here can start, approve or change any work."
      />
      {panel && <AgentPanel panel={panel} />}
      <OfficeView snapshot={snapshot} />
    </div>
  );
}
