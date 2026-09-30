/**
 * app/admin/workforce/knowledge/page.tsx — Stage 11.1: Knowledge list (read-only).
 *
 * Real persisted knowledge_documents rows (never reconstructed). Display
 * filters only: scope (platform/tenant/all, default platform) and category
 * (the 16 CHECK values). Unknown filter values fall back, never 500. The
 * list NEVER selects document content — titles and metadata only.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import {
  fetchDocumentList,
  fetchTenantNames,
  isKnowledgeCategoryValue,
  isKnowledgeScopeValue,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_SCOPES,
  scopeLabel,
  statusBadge,
} from "@/lib/workforce/knowledge";

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
  const tenantIds = documents.map((d) => d.tenant_id).filter((t): t is string => t !== null);
  const tenantNames = await fetchTenantNames(supabase, tenantIds);
  const nameById = new Map(tenantNames.map((t) => [t.id, t.name]));

  const chipHref = (s: string, c: string | null) =>
    `/admin/workforce/knowledge?scope=${s}${c ? `&category=${c}` : ""}`;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <BookOpen size={22} /> Knowledge
        </h1>
        <p className="text-sm text-zinc-400">
          {documents.length} document(s)
          {` · scope ${activeScope}`}
          {activeCategory ? ` · category ${activeCategory}` : ""} · read from storage, never generated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {KNOWLEDGE_SCOPES.map((s) => (
          <Link
            key={s}
            href={chipHref(s, activeCategory)}
            className={`rounded-xl px-3 py-1 text-sm ${activeScope === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {s === "platform" ? "Platform" : s === "tenant" ? "Tenant" : "All"}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={chipHref(activeScope, null)}
          className={`rounded-xl px-3 py-1 text-sm ${activeCategory === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all categories
        </Link>
        {KNOWLEDGE_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={chipHref(activeScope, c)}
            className={`rounded-xl px-3 py-1 text-sm ${activeCategory === c ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {c}
          </Link>
        ))}
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No knowledge documents{activeScope !== "all" ? ` with scope ${activeScope}` : ""}
          {activeCategory ? ` in category ${activeCategory}` : ""} yet. Migration seeds are the only writer.
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => {
            const badge = statusBadge(d.status);
            return (
              <li key={d.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/workforce/knowledge/${d.id}`} className="text-sm text-white hover:underline">
                    {d.title}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {d.category} · {d.source_type} · v{d.version} · {new Date(d.updated_at).toLocaleString()}
                  </p>
                  {d.category === "agent_memory" && (
                    <p className="text-xs text-amber-400/80">agent_memory — read-only; memory design is Stage 12.</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-xl bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    {scopeLabel(d.tenant_id, d.tenant_id ? (nameById.get(d.tenant_id) ?? null) : null)}
                  </span>
                  <span
                    className={`rounded-xl px-2 py-0.5 text-xs ${
                      badge.tone === "ok"
                        ? "bg-emerald-900 text-emerald-200"
                        : badge.tone === "bad"
                          ? "bg-red-900 text-red-200"
                          : badge.tone === "warn"
                            ? "bg-amber-900 text-amber-200"
                            : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {badge.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
