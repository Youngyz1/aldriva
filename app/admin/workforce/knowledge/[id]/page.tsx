/**
 * app/admin/workforce/knowledge/[id]/page.tsx — Stage 11.1: Document detail (read-only).
 *
 * Metadata, capped content preview, version history (metadata only) and
 * chunk count. Content renders as plain escaped text with
 * whitespace-pre-wrap — plain escaped text only, never raw HTML (content can be
 * agent-generated or admin-authored). Malformed/missing id → notFound().
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import {
  fetchDocumentDetail,
  fetchDocumentChunks,
  fetchTenantNames,
  isDocumentIdShape,
  buildContentPreview,
  buildChunkPreview,
  scopeLabel,
  shortId,
  statusBadge,
} from "@/lib/workforce/knowledge";

export default async function WorkforceKnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isDocumentIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchDocumentDetail(supabase, id);
  if (!raw) notFound();
  // Chunks only after the parent document read succeeded above.
  const chunks = await fetchDocumentChunks(supabase, raw.document.id);
  const d = raw.document;
  const badge = statusBadge(d.status);
  const preview = buildContentPreview(d.content);
  const tenantNames = d.tenant_id ? await fetchTenantNames(supabase, [d.tenant_id]) : [];
  const tenantName = tenantNames[0]?.name ?? null;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <BookOpen size={22} /> {d.title}
        </h1>
        <p className="text-sm text-zinc-400">
          {d.category} · {badge.label} · {scopeLabel(d.tenant_id, tenantName)}
        </p>
        {d.category === "agent_memory" && (
          <p className="text-xs text-amber-400/80">agent_memory — read-only; memory design is Stage 12.</p>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Metadata</h2>
        <p className="text-sm text-zinc-400">status: {d.status}</p>
        <p className="text-sm text-zinc-400">category: {d.category}</p>
        <p className="text-sm text-zinc-400">source type: {d.source_type}</p>
        <p className="text-sm text-zinc-400">source ref: {d.source_ref ?? "—"}</p>
        <p className="text-sm text-zinc-400">source hash: {d.source_hash ?? "—"}</p>
        <p className="text-sm text-zinc-400">version: v{d.version}</p>
        <p className="text-sm text-zinc-400">
          approved: {d.approved_by ? `${shortId(d.approved_by)}${d.approved_at ? ` · ${new Date(d.approved_at).toLocaleString()}` : ""}` : "—"}
        </p>
        <p className="text-sm text-zinc-400">
          created: {d.created_by ? `${shortId(d.created_by)} · ` : ""}{new Date(d.created_at).toLocaleString()}
        </p>
        <p className="text-sm text-zinc-400">updated: {new Date(d.updated_at).toLocaleString()}</p>
      </div>

      {/* Content preview */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Content preview</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-400">{preview.text}</p>
        {preview.truncated && (
          <p className="mt-2 text-xs text-zinc-500">Preview truncated — full content stays in storage.</p>
        )}
      </div>

      {/* Version history (metadata only) */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Version history ({raw.versions.length})</h2>
        {raw.versions.length === 0 ? (
          <p className="text-sm text-zinc-500">No stored versions for this document.</p>
        ) : (
          <ul className="space-y-1">
            {raw.versions.map((v) => (
              <li key={v.version} className="text-sm text-zinc-400">
                v{v.version} — {v.title.slice(0, 120)} · {new Date(v.created_at).toLocaleString()}
                {v.created_by ? ` · by ${shortId(v.created_by)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Chunks */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Retrieval chunks ({chunks.length} of {raw.chunkCount} indexed)</h2>
        {chunks.length === 0 ? (
          <p className="text-sm text-zinc-500">No chunks stored for this document.</p>
        ) : (
          <ul className="space-y-2">
            {chunks.map((c) => {
              const preview = buildChunkPreview(c.content);
              return (
                <li key={c.id} className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-500">
                    chunk {c.chunk_index} · {scopeLabel(c.tenant_id, null)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-zinc-400">{preview.text}</p>
                  {preview.truncated && (
                    <p className="mt-1 text-xs text-zinc-500">Chunk text truncated at the viewer cap.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Link href="/admin/workforce/knowledge" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Knowledge
      </Link>
    </div>
  );
}
