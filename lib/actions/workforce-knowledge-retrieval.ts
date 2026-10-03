"use server";

/**
 * lib/actions/workforce-knowledge-retrieval.ts — Stage 11 retrieval test box.
 *
 * NARROW SERVICE-ROLE EXCEPTION (documented in docs/CHANGELOG.md, Stage 11
 * complete entry): this is the ONLY file in the stage allowed to reach
 * retrieveKnowledge(), which uses the service-role client INTERNALLY
 * (lib/ai/knowledge.ts:8,91) and offers no user-client path. Conditions met:
 * requireAdmin() first; tenant re-validated against a server-fetched
 * allowlist (admin's own session client); query trimmed and capped at 300
 * chars; retrieval limit fixed at 4 (never client-controlled); rate-limited
 * per admin user id BEFORE the call; nothing persisted; never called during
 * page render (only from the retrieval form action). This file itself never
 * imports createSupabaseAdmin or any service-role client — statically
 * asserted in lib/workforce/__tests__/knowledge.test.cjs.
 */
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { retrieveKnowledge, formatKnowledgeForPrompt } from "@/lib/ai/knowledge";
import {
  fetchTenantOptions,
  validateRetrievalQuery,
  isAllowedRetrievalTenant,
  isFallbackChunkId,
  buildContentPreview,
} from "@/lib/workforce/knowledge";

export interface RetrievalTestChunk {
  title: string;
  category: string;
  text: string;
  truncated: boolean;
}

export interface RetrievalTestResult {
  ok: boolean;
  message: string;
  appliedScope: string;
  count: number;
  fallbackUsed: boolean;
  chunks: RetrievalTestChunk[];
  promptBlock: string;
}

const RETRIEVAL_LIMIT = 4;

export async function runRetrievalTest(
  _prev: RetrievalTestResult | null,
  formData: FormData
): Promise<RetrievalTestResult> {
  await requireAdmin();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not signed in.", appliedScope: "", count: 0, fallbackUsed: false, chunks: [], promptBlock: "" };

  const checked = validateRetrievalQuery(formData.get("query"));
  if (!checked.ok) {
    return { ok: false, message: checked.message, appliedScope: "", count: 0, fallbackUsed: false, chunks: [], promptBlock: "" };
  }

  const limited = await checkRateLimit("workforceKnowledgeRetrievalTest", `user:${user.id}`);
  if (!limited.allowed) {
    return { ok: false, message: "Too many retrieval tests. Please try again shortly.", appliedScope: "", count: 0, fallbackUsed: false, chunks: [], promptBlock: "" };
  }

  const supabase = await createSupabaseServer();
  const options = await fetchTenantOptions(supabase);
  const submitted = String(formData.get("tenant") ?? "platform");
  if (!isAllowedRetrievalTenant(submitted, options.map((o) => o.id))) {
    return { ok: false, message: "Unknown tenant selection.", appliedScope: "", count: 0, fallbackUsed: false, chunks: [], promptBlock: "" };
  }
  const tenantId = submitted === "platform" ? null : submitted;

  let retrieval;
  try {
    retrieval = await retrieveKnowledge(checked.query, tenantId, RETRIEVAL_LIMIT);
  } catch {
    return { ok: false, message: "Retrieval failed.", appliedScope: "", count: 0, fallbackUsed: false, chunks: [], promptBlock: "" };
  }

  const chunks: RetrievalTestChunk[] = retrieval.chunks.map((c) => {
    const preview = buildContentPreview(c.content);
    return {
      title: c.title ?? "(untitled)",
      category: c.category ?? "knowledge",
      text: preview.text,
      truncated: preview.truncated,
    };
  });
  return {
    ok: true,
    message: "Retrieval complete.",
    appliedScope: tenantId === null ? "Platform only" : `Tenant ${options.find((o) => o.id === tenantId)?.name ?? tenantId}`,
    count: chunks.length,
    fallbackUsed: retrieval.chunks.some((c) => isFallbackChunkId(c.id)),
    chunks,
    promptBlock: formatKnowledgeForPrompt(retrieval),
  };
}
