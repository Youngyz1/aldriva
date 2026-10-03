"use client";

/**
 * app/admin/users/identity-verifications/IdentityVerificationsAdminClient.tsx
 * Client half of the personal identity verification queue: the server page
 * keeps requireAdmin() plus the service-role queries and passes enriched
 * rows. Approve / Reject / Request-info keep their PATCH endpoint, payload,
 * toast, and refresh shapes byte-identical — only the layout moves to the
 * shared admin table (title = person, value = status, meta = submitted date
 * + document type, detail = everything else real).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type {
  AdminColumn,
  RowActionsConfig,
} from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";

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

const copy = adminPageCopy["identity-verifications"];

/** Pill-dot colors carry the old status-badge semantics. */
const STATUS_DOT: Record<string, string> = {
  submitted: "bg-blue-500",
  needs_more_info: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
};

function isActionable(status: string) {
  return status === "submitted" || status === "needs_more_info";
}

function formatSubmitted(sub: Submission) {
  return sub.submitted_at
    ? new Date(sub.submitted_at).toLocaleString("en-US", { timeZone: "UTC" })
    : new Date(sub.created_at).toLocaleString("en-US", { timeZone: "UTC" });
}

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

  /**
   * Actionable rows: primary approves (the person's verification status
   * flips to verified via the API), the menu holds Request Info and
   * Reject last + destructive. Decided rows carry no actions; their
   * reviewer notes stay visible in the notes column.
   */
  function buildRowActions(sub: Submission): RowActionsConfig | undefined {
    if (!isActionable(sub.status)) return undefined;
    const acting = actingId === sub.id;
    return {
      primary: {
        key: "approve",
        label: acting ? "Approving..." : "Approve Identity",
        onSelect: () => handleReviewAction(sub.id, "approved"),
        disabled: acting,
      },
      menu: [
        {
          key: "request-info",
          label: "Request Info",
          onSelect: () => handleReviewAction(sub.id, "needs_more_info"),
          disabled: acting,
        },
        {
          key: "reject",
          label: "Reject",
          onSelect: () => handleReviewAction(sub.id, "rejected"),
          disabled: acting,
          destructive: true,
        },
      ],
    };
  }

  // Priority hiding (detail first, then meta; title/value never hide):
  // documents + notes below 1024px container, dates/type below 800px.
  const columns: AdminColumn[] = [
    { id: "person", header: "Person", role: "title" },
    { id: "status", header: "Status", role: "value", width: "140px" },
    { id: "submitted", header: "Submitted", role: "meta", align: "right", hideBelow: "md" },
    { id: "idtype", header: "ID Type", role: "meta", hideBelow: "md" },
    { id: "documents", header: "Documents", role: "detail", hideBelow: "lg" },
    { id: "notes", header: "Notes", role: "detail", hideBelow: "lg" },
  ];

  const statValues = {
    submitted: submissions.filter((s) => s.status === "submitted").length,
    needs_more_info: submissions.filter((s) => s.status === "needs_more_info").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
    total: submissions.length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <StatStrip items={buildStats(copy.stats, statValues)} />

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

      <TableToolbar
        tabs={(copy.tabs ?? []).map((t) => ({
          value: t.value,
          label: t.label,
          count: submissions.filter((s) => (t.value === "all" ? true : s.status === t.value)).length,
          active: filterStatus === t.value,
          onSelect: () => setFilterStatus(t.value),
        }))}
        filters={[]}
      />

      <AdminTable
        columns={columns}
        rows={filtered.map((sub) => ({
          id: sub.id,
          cells: [
            <span key="person" className="block">
              <span className="block text-xs font-bold text-zinc-900">{sub.user_name}</span>
              <span className="block text-[10px] font-normal text-zinc-400">{sub.user_email}</span>
            </span>,
            <span key="status" className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[sub.status] ?? "bg-zinc-400"}`}
              />
              <span className="capitalize">{sub.status.replace(/_/g, " ")}</span>
            </span>,
            <span key="submitted" className="whitespace-nowrap font-mono text-xs text-zinc-500">
              {formatSubmitted(sub)}
            </span>,
            <span key="idtype" className="font-bold uppercase text-zinc-800">
              {sub.id_type ?? "Not specified"}
            </span>,
            <span key="documents" className="block space-y-1">
              {sub.documents.length === 0 ? (
                <span className="text-xs font-medium text-zinc-400">No documents attached.</span>
              ) : (
                sub.documents.map((doc, idx) => (
                  <span key={idx} className="flex items-center gap-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                    <span className="font-bold text-zinc-800">{doc.file_name}</span>
                    <span className="text-[10px] font-bold uppercase text-zinc-400">({doc.doc_type})</span>
                  </span>
                ))
              )}
            </span>,
            <span key="notes" className="block max-w-xs text-xs text-zinc-600">
              {sub.submitter_notes ? (
                <span className="block">
                  <span className="font-bold text-zinc-800">User Notes:</span> {sub.submitter_notes}
                </span>
              ) : null}
              {!isActionable(sub.status) && sub.reviewer_notes ? (
                <span className="block">
                  <span className="font-bold text-zinc-700">Reviewer Notes:</span> {sub.reviewer_notes}
                </span>
              ) : null}
              {!sub.submitter_notes && (isActionable(sub.status) || !sub.reviewer_notes) ? (
                <span className="text-zinc-400">—</span>
              ) : null}
            </span>,
          ],
          detailExtra: [
            { label: "Current identity status", value: sub.current_identity_status },
            ...(sub.documents.length > 0
              ? sub.documents.map((doc, idx) => ({
                  label: `Document ${idx + 1} storage path`,
                  value: <span className="font-mono text-[11px] break-all">{doc.storage_path}</span>,
                }))
              : []),
            ...(isActionable(sub.status)
              ? [
                  {
                    label: "Reviewer notes",
                    value: (
                      <input
                        type="text"
                        placeholder="Reviewer notes / explanation (required if rejecting or requesting more info)..."
                        value={reviewerNotesMap[sub.id] ?? ""}
                        onChange={(e) =>
                          setReviewerNotesMap({ ...reviewerNotesMap, [sub.id]: e.target.value })
                        }
                        aria-label={`Reviewer notes for ${sub.user_name}`}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium outline-none focus:border-orange-500 focus:bg-white"
                      />
                    ),
                  },
                ]
              : []),
          ],
          actions: buildRowActions(sub),
        }))}
        emptyMessage={`No submissions found for status '${filterStatus}'.`}
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {filtered.length === 0
              ? tableStrings.showingNone(submissions.length)
              : tableStrings.showingResults(1, filtered.length, submissions.length)}
          </p>
        </div>
      </div>
    </div>
  );
}
