/**
 * app/admin/ai/rejections/page.tsx
 *
 * Hard Gate Deliverable per ADR-0002 §4:
 * Admin panel at /admin/ai/rejections surfacing security rejection logs from ai_guard_rejections.
 */

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  FileText,
  Clock,
  Tag,
  CheckCircle2,
  Lock,
} from "lucide-react";

export interface GuardRejectionRow {
  id: string;
  context: string;
  category: string;
  reason: string;
  excerpt: string | null;
  content_type: string | null;
  source_id: string | null;
  verdict: 'flagged' | 'rejected';
  created_at: string;
}

export default async function AIRejectionsAuditPage() {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("ai_guard_rejections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows: GuardRejectionRow[] = (data || []) as GuardRejectionRow[];

  const flaggedCount = rows.filter((r) => r.verdict === "flagged").length;
  const rejectedCount = rows.filter((r) => r.verdict === "rejected").length;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
            <Link
              href="/admin/ai"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> AI Growth Studio
            </Link>
            <span>/</span>
            <span className="text-zinc-200">Security Audit</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-amber-500" />
            AI Output Guard Rejections
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Permanent audit record of prompt injections, system prompt echoes, and PII leakage blocked by{" "}
            <code className="text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded text-xs">
              lib/ai/output-guard.ts
            </code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/ai/rejections"
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-200 transition-colors border border-zinc-700"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </Link>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Total Logged</p>
            <p className="text-2xl font-bold text-white mt-1">{rows.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-red-900/40 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-red-400 uppercase tracking-wider font-semibold">Hard Rejections</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{rejectedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-800/50 flex items-center justify-center text-red-400">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-amber-900/40 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-amber-400 uppercase tracking-wider font-semibold">Sanitised Flags</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{flaggedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-800/50 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Database Query Error Warning */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-200 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Error querying ai_guard_rejections table:</span> {error.message}
            <p className="text-xs text-red-400 mt-1">
              Ensure migration <code className="bg-red-900/40 px-1 py-0.5 rounded">db/migration_89_ai_guard_rejections.sql</code> has been applied to Supabase.
            </p>
          </div>
        </div>
      )}

      {/* Rejections Audit Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            Audit Records (Latest 100)
          </h2>
          <span className="text-xs text-zinc-400">Table: <code className="text-zinc-300">ai_guard_rejections</code></span>
        </div>

        {rows.length === 0 ? (
          <div className="py-16 text-center text-zinc-400 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto opacity-80" />
            <p className="text-base font-medium text-zinc-200">No Guard Rejections Logged</p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              No prompt injection attempts, PII leaks, or system prompt echoes have been detected yet.
              Any event flagged or rejected by <code className="text-zinc-300">output-guard.ts</code> will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Verdict</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Context</th>
                  <th className="py-3 px-4">Content / Source</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Offending Excerpt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-400 font-mono text-[11px]">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {row.verdict === "rejected" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-red-400 font-semibold text-[10px] uppercase">
                          <Lock className="w-3 h-3" /> Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-800 text-amber-400 font-semibold text-[10px] uppercase">
                          <AlertTriangle className="w-3 h-3" /> Flagged
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                        <Tag className="w-3 h-3 text-zinc-400" />
                        {row.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-zinc-300">
                      {row.context}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-zinc-400">
                      {row.content_type || "n/a"}{" "}
                      {row.source_id ? (
                        <span className="text-zinc-500">({row.source_id.slice(0, 8)}…)</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-zinc-200">
                      {row.reason}
                    </td>
                    <td className="py-3 px-4 max-w-sm">
                      {row.excerpt ? (
                        <code className="block p-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 font-mono text-[11px] truncate max-w-xs">
                          {row.excerpt}
                        </code>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
