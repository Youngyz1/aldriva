"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";

type Submission = {
  id: string;
  user_id: string;
  status: string;
  id_type: string | null;
  documents: Array<{ doc_type: string; storage_path: string; file_name: string }>;
  submitter_notes: string | null;
  reviewer_notes: string | null;
  submitted_at: string | null;
  created_at: string;
  user_email: string;
  user_name: string;
  current_identity_status: string;
};

export default function IdentityVerificationsAdminClient({
  initialSubmissions,
}: {
  initialSubmissions: Submission[];
}) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [filterStatus, setFilterStatus] = useState<string>("submitted");
  const [actingId, setActingId] = useState<string | null>(null);
  const [reviewerNotesMap, setReviewerNotesMap] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = submissions.filter((s) => {
    if (filterStatus === "all") return true;
    return s.status === filterStatus;
  });

  async function handleReviewAction(
    submissionId: string,
    actionStatus: "approved" | "rejected" | "needs_more_info"
  ) {
    setActingId(submissionId);
    setError(null);
    setToast(null);

    const notes = reviewerNotesMap[submissionId] ?? "";

    try {
      const res = await fetch(`/api/admin/identity-verifications/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: actionStatus,
          reviewer_notes: notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update review status.");

      setToast(`Submission successfully updated to '${actionStatus}'.`);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, ...data.submission } : s))
      );
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Review action failed.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-950">Personal Identity Verification Queue</h1>
          <p className="text-xs text-zinc-500 font-medium mt-0.5">
            Review government ID document submissions and verify user identity profiles.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          {["submitted", "needs_more_info", "approved", "rejected", "all"].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition ${
                filterStatus === st
                  ? "bg-brand-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {st.replace(/_/g, " ")} ({submissions.filter((s) => (st === "all" ? true : s.status === st)).length})
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
          {error}
        </div>
      )}

      {/* Submissions List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-2 text-sm font-bold text-zinc-700">No submissions found for status '{filterStatus}'.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((sub) => (
            <div key={sub.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-zinc-900">{sub.user_name}</h3>
                    <span className="text-xs text-zinc-500 font-medium">({sub.user_email})</span>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium mt-0.5">
                    ID Type: <span className="font-bold text-zinc-800 uppercase">{sub.id_type ?? "Not specified"}</span> · Submitted:{" "}
                    {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : new Date(sub.created_at).toLocaleString()}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black capitalize ${
                    sub.status === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : sub.status === "rejected"
                      ? "bg-rose-100 text-rose-800"
                      : sub.status === "needs_more_info"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {sub.status.replace(/_/g, " ")}
                </span>
              </div>

              {/* Documents List */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-2">
                <span className="text-xs font-black uppercase text-zinc-500">Uploaded Identity Documents</span>
                {sub.documents.length === 0 ? (
                  <p className="text-xs text-zinc-400 font-medium">No documents attached.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sub.documents.map((doc, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-2.5 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-brand-600" />
                          <span className="font-bold text-zinc-800 truncate">{doc.file_name}</span>
                          <span className="text-[10px] text-zinc-400 font-bold uppercase">({doc.doc_type})</span>
                        </div>
                        <span className="text-[11px] font-bold text-brand-600 hover:underline">
                          Path: {doc.storage_path.slice(0, 20)}...
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {sub.submitter_notes && (
                <p className="text-xs text-zinc-600 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                  <span className="font-bold text-zinc-800">User Notes:</span> {sub.submitter_notes}
                </p>
              )}

              {/* Review Controls */}
              {sub.status === "submitted" || sub.status === "needs_more_info" ? (
                <div className="space-y-3 pt-2 border-t border-zinc-100">
                  <input
                    type="text"
                    placeholder="Reviewer notes / explanation (required if rejecting or requesting more info)..."
                    value={reviewerNotesMap[sub.id] ?? ""}
                    onChange={(e) => setReviewerNotesMap({ ...reviewerNotesMap, [sub.id]: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium outline-none focus:border-orange-500 focus:bg-white"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      disabled={actingId === sub.id}
                      onClick={() => handleReviewAction(sub.id, "needs_more_info")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Request Info
                    </button>

                    <button
                      disabled={actingId === sub.id}
                      onClick={() => handleReviewAction(sub.id, "rejected")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Reject
                    </button>

                    <button
                      disabled={actingId === sub.id}
                      onClick={() => handleReviewAction(sub.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {actingId === sub.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      Approve Identity
                    </button>
                  </div>
                </div>
              ) : (
                sub.reviewer_notes && (
                  <p className="text-xs text-zinc-500 font-medium">
                    <span className="font-bold text-zinc-700">Reviewer Notes:</span> {sub.reviewer_notes}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
