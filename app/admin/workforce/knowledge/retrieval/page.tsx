/**
 * app/admin/workforce/knowledge/retrieval/page.tsx — Stage 11: retrieval test box.
 *
 * Read-only: runs the existing retrieveKnowledge SELECT path through a
 * rate-limited, admin-gated server action. Nothing is persisted. The tenant
 * dropdown is server-rendered from organizers visible to the admin session.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { fetchTenantOptions } from "@/lib/workforce/knowledge";
import RetrievalTestForm from "./retrieval-test-form";

export default async function WorkforceRetrievalTestPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  const tenants = await fetchTenantOptions(supabase);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <FlaskConical size={22} /> Retrieval test
        </h1>
        <p className="text-sm text-zinc-400">
          Runs the live retrieval path (FTS + trigram fallback) without persisting anything.
          Rate-limited per admin.
        </p>
      </div>

      <RetrievalTestForm tenants={tenants} />

      <Link href="/admin/workforce/knowledge" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Knowledge
      </Link>
    </div>
  );
}
