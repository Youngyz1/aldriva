"use client";

import { useMemo, useState } from "react";
import {
  parseDonorsPaste,
  parseCommentsPaste,
  summarizeDonors,
  type RowError,
} from "@/lib/fundraiser-import";
import { money } from "@/lib/format";

type ImportResult = {
  donorsInserted: number;
  commentsInserted: number;
  raised: number | null;
};

function SkippedRows({ errors }: { errors: RowError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
      <p className="font-black">
        {errors.length} row{errors.length === 1 ? "" : "s"} skipped:
      </p>
      <ul className="mt-1 space-y-0.5">
        {errors.slice(0, 8).map((e) => (
          <li key={e.line}>
            Line {e.line}: {e.reason}
          </li>
        ))}
        {errors.length > 8 && <li>…and {errors.length - 8} more</li>}
      </ul>
    </div>
  );
}

/**
 * Admin-only donor & comment import. Rendered exclusively on admin screens —
 * never in the user-facing create/edit fundraiser flow.
 */
export default function FundraiserImportPanel({ fundraiserId }: { fundraiserId: string }) {
  const [donorsText, setDonorsText] = useState("");
  const [commentsText, setCommentsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const donors = useMemo(() => parseDonorsPaste(donorsText), [donorsText]);
  const comments = useMemo(() => parseCommentsPaste(commentsText), [commentsText]);
  const donorSummary = useMemo(() => summarizeDonors(donors.rows), [donors.rows]);

  const canImport = donors.rows.length > 0 || comments.rows.length > 0;

  async function handleImport() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/admin/fundraisers/${fundraiserId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donorsText, commentsText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }
      setResult({
        donorsInserted: data.donorsInserted,
        commentsInserted: data.commentsInserted,
        raised: data.raised,
      });
      setDonorsText("");
      setCommentsText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-zinc-950">Import donors &amp; comments</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Paste historical records from an external platform (e.g. GoFundMe). Imported donations set this
        campaign&rsquo;s raised total, donation count, and recent-donor list. Names are stored exactly as pasted, and
        imported rows can&rsquo;t be edited or deleted through the normal UI.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ── Donors ── */}
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-zinc-500">Donors</label>
          <p className="mt-0.5 text-xs text-zinc-400">
            Format: <code>Name | Date | Amount</code> — one per line.
          </p>
          <textarea
            value={donorsText}
            onChange={(e) => setDonorsText(e.target.value)}
            rows={8}
            placeholder={"Anka B | 2026-06-19 | 50\nAnonymous | 2026-06-20 | 25"}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {donorsText.trim() && (
            <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs ring-1 ring-zinc-200">
              <p className="font-black text-zinc-700">
                {donorSummary.count} valid donor{donorSummary.count === 1 ? "" : "s"} · {money(donorSummary.total)} total
              </p>
              {donors.rows.length > 0 && (
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                  {donors.rows.slice(0, 20).map((r) => (
                    <li key={r.line} className="flex justify-between gap-2 text-zinc-600">
                      <span className="truncate">
                        {r.name} · {r.date}
                      </span>
                      <span className="font-bold">{money(r.amount)}</span>
                    </li>
                  ))}
                  {donors.rows.length > 20 && (
                    <li className="text-zinc-400">…and {donors.rows.length - 20} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          <SkippedRows errors={donors.errors} />
        </div>

        {/* ── Comments ── */}
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
            Comments (Words of Support)
          </label>
          <p className="mt-0.5 text-xs text-zinc-400">
            Format: <code>Name | Date | Comment | Likes</code> — Likes optional.
          </p>
          <textarea
            value={commentsText}
            onChange={(e) => setCommentsText(e.target.value)}
            rows={8}
            placeholder={"Anka B | 2026-06-19 | Sending love and strength | 3"}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {commentsText.trim() && (
            <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs ring-1 ring-zinc-200">
              <p className="font-black text-zinc-700">
                {comments.rows.length} valid comment{comments.rows.length === 1 ? "" : "s"}
              </p>
              {comments.rows.length > 0 && (
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                  {comments.rows.slice(0, 20).map((r) => (
                    <li key={r.line} className="text-zinc-600">
                      <span className="font-bold">{r.name}</span> · {r.date} · ♥ {r.likes}
                      <span className="block truncate text-zinc-500">{r.body}</span>
                    </li>
                  ))}
                  {comments.rows.length > 20 && (
                    <li className="text-zinc-400">…and {comments.rows.length - 20} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          <SkippedRows errors={comments.errors} />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900">
          Imported {result.donorsInserted} donor{result.donorsInserted === 1 ? "" : "s"} and{" "}
          {result.commentsInserted} comment{result.commentsInserted === 1 ? "" : "s"}.
          {result.raised !== null && (
            <>
              {" "}
              New raised total: <span className="font-black">{money(result.raised)}</span>.
            </>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!canImport || loading}
        onClick={handleImport}
        className="mt-4 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-50"
      >
        {loading
          ? "Importing…"
          : `Import ${donors.rows.length} donor${donors.rows.length === 1 ? "" : "s"} & ${comments.rows.length} comment${comments.rows.length === 1 ? "" : "s"}`}
      </button>
    </section>
  );
}
