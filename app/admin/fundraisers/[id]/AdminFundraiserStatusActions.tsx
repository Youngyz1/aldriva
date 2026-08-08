"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "pending_review" | "published" | "rejected";

/** Approve / reject controls for the admin fundraiser management page. */
export default function AdminFundraiserStatusActions({
  fundraiserId,
  initialStatus,
  initialRejectionReason,
}: {
  fundraiserId: string;
  initialStatus: Status;
  initialRejectionReason: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [rejectionReason, setRejectionReason] = useState(initialRejectionReason ?? "");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function patch(payload: Record<string, unknown>) {
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/fundraisers/${fundraiserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      if (typeof payload.status === "string") {
        const next = payload.status as Status;
        setStatus(next);
        setRejectionReason(next === "rejected" ? reason.trim() : "");
        if (next !== "rejected") setReason("");
      }
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  const badge =
    status === "published"
      ? "bg-brand-100 text-brand-800"
      : status === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  const label =
    status === "pending_review" ? "Pending review" : status === "published" ? "Published" : "Rejected";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-black text-zinc-950">Review status</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${badge}`}>{label}</span>
        {status === "rejected" && rejectionReason && (
          <span className="text-xs font-semibold text-zinc-500">{rejectionReason}</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        {status !== "published" && (
          <button
            type="button"
            disabled={working}
            onClick={() => patch({ status: "published" })}
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            {working ? "Working…" : "Approve & Publish"}
          </button>
        )}
        {status !== "rejected" && (
          <div className="flex-1 space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Optional reason shown to the owner…"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            <button
              type="button"
              disabled={working}
              onClick={() => patch({ status: "rejected", rejection_reason: reason.trim() || null })}
              className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              {working ? "Working…" : "Reject"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
