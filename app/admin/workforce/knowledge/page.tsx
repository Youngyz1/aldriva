/**
 * app/admin/workforce/knowledge/page.tsx — Stage 11.1: Knowledge list (read-only).
 *
 * Real persisted knowledge_documents rows (never reconstructed). Display
 * filters only: scope (platform/tenant/all, default platform) and category
 * (the 16 CHECK values). Unknown filter values fall back, never 500. The
 * list NEVER selects document content — titles and metadata only.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to knowledge/[id]; no actions.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import {
  fetchDocumentList,
  fetchSourcesSummary,
  fetchTenantNames,
  isKnowledgeCategoryValue,
  isKnowledgeScopeValue,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_SCOPES,
  scopeLabel,
  statusBadge,
} from "@/lib/workforce/knowledge";

const BADGE_TONE: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  bad: "bg-red-100 text-red-600",
  warn: "bg-amber-100 text-amber-700",
};

const columns: AdminColumn[] = [
  { id: "title", header: "Document", role: "title" },
  { id: "status", header: "Status", role: "value", width: "130px" },
  { id: "category", header: "Category", role: "meta" },
  { id: "scope", header: "Scope", role: "meta", hideBelow: "md" },
  { id: "updated", header: "Updated", role: "meta", align: "right", hideBelow: "md" },
];

export default async function WorkforceKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; category?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { scope, category } = await searchParams;

  const activeScope = scope && isKnowledgeScopeValue(scope) ? scope : "platform";
  const activeCategory = category && isKnowledgeCategoryValue(category) ? category : null;

  const supabase = await createSupabaseServer();
  const documents = await fetchDocumentList(supabase, activeScope, activeCategory);
  const sources = await fetchSourcesSummary(supabase, activeScope, activeCategory);
  const tenantIds = documents.map((d) => d.tenant_id).filter((t): t is string => t !== null);
  const tenantNames = await fetchTenantNames(supabase, tenantIds);
  const nameById = new Map(tenantNames.map((t) => [t.id, t.name]));

  const chipHref = (s: string, c: string | null) =>
    `/admin/workforce/knowledge?scope=${s}${c ? `&category=${c}` : ""}`;
  const chip = (isActive: boolean) =>
    `rounded-xl px-3 py-1 text-sm font-medium ${isActive ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Knowledge</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Knowledge"
        description={`${documents.length} document(s) · scope ${activeScope}${activeCategory ? ` · category ${activeCategory}` : ""} · read from storage, never generated.`}
      />

      <StatStrip
        items={[
          { label: "Shown", value: documents.length },
          { label: "Scanned", value: sources.scanned },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {KNOWLEDGE_SCOPES.map((s) => (
          <Link key={s} href={chipHref(s, activeCategory)} className={chip(activeScope === s)}>
            {s === "platform" ? "Platform" : s === "tenant" ? "Tenant" : "All"}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={chipHref(activeScope, null)} className={chip(activeCategory === null)}>
          all categories
        </Link>
        {KNOWLEDGE_CATEGORIES.map((c) => (
          <Link key={c} href={chipHref(activeScope, c)} className={chip(activeCategory === c)}>
            {c}
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={documents.map((d) => {
          const badge = statusBadge(d.status);
          return {
            id: d.id,
            detailHref: `/admin/workforce/knowledge/${d.id}`,
            cells: [
              <span key="title">
                <Link
                  href={`/admin/workforce/knowledge/${d.id}`}
                  className="font-semibold text-zinc-950 hover:underline"
                >
                  {d.title}
                </Link>
                {d.category === "agent_memory" && (
                  <span className="block text-xs text-amber-600">
                    agent_memory — read-only; memory design is Stage 12.
                  </span>
                )}
              </span>,
              <span
                key="status"
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${BADGE_TONE[badge.tone] ?? "bg-zinc-100 text-zinc-600"}`}
              >
                {badge.label}
              </span>,
              <span key="category" className="text-zinc-600">
                {d.category} · {d.source_type} · v{d.version}
              </span>,
              <span key="scope" className="text-zinc-600">
                {scopeLabel(d.tenant_id, d.tenant_id ? (nameById.get(d.tenant_id) ?? null) : null)}
              </span>,
              <span key="updated" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(d.updated_at).toLocaleString()}
              </span>,
            ],
          };
        })}
        emptyMessage={`No knowledge documents${activeScope !== "all" ? ` with scope ${activeScope}` : ""}${activeCategory ? ` in category ${activeCategory}` : ""} yet. Migration seeds are the only writer.`}
      />

      {/* Sources summary */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">
          Sources{activeScope !== "all" ? ` · scope ${activeScope}` : ""}
          {activeCategory ? ` · ${activeCategory}` : ""} ({sources.scanned} scanned
          {sources.capped ? ", capped" : ""})
        </h2>
        <p className="text-sm text-zinc-600">
          by type: {sources.byType.length === 0 ? "—" : sources.byType.map((t) => `${t.key} (${t.count})`).join(", ")}
        </p>
        <p className="text-sm text-zinc-600">
          by ref: {sources.byRef.length === 0 ? "—" : sources.byRef.map((r) => `${r.key} (${r.count})`).join(", ")}
        </p>
      </section>

      {/* Agent knowledge */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Agent knowledge</h2>
        <p className="text-sm text-zinc-600">
          All agents currently receive identical retrieval: platform documents plus the run tenant&apos;s
          documents, injected into the system prompt by the orchestrator. There is no per-agent
          assignment model in the schema — no agent allowlist, no per-agent filter. Per-agent
          assignment is deferred to a later stage.
        </p>
      </section>

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {documents.length === 0
            ? tableStrings.showingNone(documents.length)
            : tableStrings.showingResults(1, documents.length, documents.length)}
        </p>
      </div>

      <div className="flex gap-4">
        <Link href="/admin/workforce/knowledge/retrieval" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          Test retrieval →
        </Link>
      </div>
    </div>
  );
}
