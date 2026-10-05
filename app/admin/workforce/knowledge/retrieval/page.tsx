/**
 * app/admin/workforce/knowledge/retrieval/page.tsx — Stage 11: retrieval test box.
 *
 * Read-only: runs the existing retrieveKnowledge SELECT path through a
 * rate-limited, admin-gated server action. Nothing is persisted. The tenant
 * dropdown is server-rendered from organizers visible to the admin session.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + light form island).
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { fetchTenantOptions } from "@/lib/workforce/knowledge";
import RetrievalTestForm from "./retrieval-test-form";

export default async function WorkforceRetrievalTestPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  const tenants = await fetchTenantOptions(supabase);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/knowledge"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Knowledge{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Retrieval test</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Retrieval test"
        description="Runs the live retrieval path (FTS + trigram fallback) without persisting anything. Rate-limited per admin."
      />

      <RetrievalTestForm tenants={tenants} />
    </div>
  );
}
