"use client";

/**
 * Retrieval test form (client island inside the server retrieval page).
 * Submits to runRetrievalTest via useActionState and renders the returned
 * result. All text renders escaped; the prompt block renders pre-wrapped.
 *
 * Stage 21 P2 restyle: light admin system. Wiring unchanged: same action,
 * same field names (query ≤300 chars, tenant allowlist), non-persisting.
 */
import { useActionState } from "react";
import { runRetrievalTest, type RetrievalTestResult } from "@/lib/actions/workforce-knowledge-retrieval";

export default function RetrievalTestForm({ tenants }: { tenants: Array<{ id: string; name: string }> }) {
  const [state, submit, pending] = useActionState<RetrievalTestResult | null, FormData>(
    runRetrievalTest,
    null
  );

  return (
    <div className="space-y-4">
      <form action={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <label htmlFor="retrieval-query" className="text-sm font-semibold text-zinc-950">
            Query (max 300 characters)
          </label>
          <textarea
            id="retrieval-query"
            name="query"
            rows={3}
            maxLength={300}
            required
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950"
          />
        </div>
        <div>
          <label htmlFor="retrieval-tenant" className="text-sm font-semibold text-zinc-950">
            Tenant scope
          </label>
          <select id="retrieval-tenant" name="tenant" className="mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950">
            <option value="platform">Platform only</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Running…" : "Run retrieval test"}
        </button>
      </form>

      {state && !state.ok && <p className="text-sm font-semibold text-red-600">{state.message}</p>}

      {state && state.ok && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            {state.message} Scope: {state.appliedScope} · {state.count} chunk(s).
          </p>
          {state.fallbackUsed && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Fallback documents used — the database was unreachable, so these results come from the
              built-in seed copies, not live rows.
            </p>
          )}
          <ul className="space-y-2">
            {state.chunks.map((c, i) => (
              <li key={i} className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-sm font-semibold text-zinc-950">
                  [{c.category}] {c.title}
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-600">{c.text}</p>
                {c.truncated && <p className="mt-1 text-xs text-zinc-500">Preview truncated.</p>}
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-base font-bold text-zinc-950">Prompt block (exact)</h2>
            <p className="whitespace-pre-wrap text-xs text-zinc-600">{state.promptBlock}</p>
          </div>
        </div>
      )}
    </div>
  );
}
