"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Building2,
  Info,
} from "lucide-react";
import {
  getRequirementsForOrgType,
  type DocRequirement,
} from "@/lib/organizer-verification-requirements";

type OrganizerData = {
  id: string;
  name: string;
  slug: string | null;
  org_type: string | null;
  status: string | null;
  verified_at: string | null;
  tax_id: string | null;
  nonprofit_registration_number: string | null;
};

type SubmittedDoc = {
  doc_type: string;
  storage_path: string;
  file_name?: string;
  uploaded_at?: string;
};

type SubmissionData = {
  id: string;
  organizer_id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "needs_more_info";
  org_type: string | null;
  documents: SubmittedDoc[];
  submitter_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function VerificationWizardClient({
  organizer,
  initialSubmission,
}: {
  organizer: OrganizerData;
  initialSubmission: SubmissionData | null;
}) {
  const router = useRouter();
  const [submission, setSubmission] = useState<SubmissionData | null>(initialSubmission);
  const [viewMode, setViewMode] = useState<"gate" | "wizard">(
    initialSubmission && (initialSubmission.status === "submitted" || initialSubmission.status === "approved")
      ? "gate"
      : organizer.status === "verified"
      ? "gate"
      : initialSubmission && (initialSubmission.status === "needs_more_info" || initialSubmission.status === "draft")
      ? "gate"
      : initialSubmission && initialSubmission.status === "rejected"
      ? "gate"
      : "wizard"
  );

  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    initialSubmission?.status === "needs_more_info" ? 2 : 1
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [documents, setDocuments] = useState<SubmittedDoc[]>(initialSubmission?.documents ?? []);
  const [notes, setNotes] = useState(initialSubmission?.submitter_notes ?? "");
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const requirements = getRequirementsForOrgType(organizer.org_type);
  const requiredTypes = requirements.filter((r) => r.required).map((r) => r.type);
  const isAllRequiredUploaded = requiredTypes.every((type) =>
    documents.some((d) => d.doc_type === type)
  );

  // Auto-save draft helper
  async function saveDraft(updatedDocs: SubmittedDoc[], updatedNotes: string) {
    try {
      const res = await fetch(`/api/organizer-verification/${organizer.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: updatedDocs,
          submitter_notes: updatedNotes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.submission) {
        setSubmission(data.submission);
      }
    } catch {
      // Background draft save error swallowed gracefully
    }
  }

  // Handle direct file upload via signed URL
  async function handleFileUpload(reqItem: DocRequirement, file: File) {
    setUploadingType(reqItem.type);
    setUploadError(null);

    try {
      let activeSubId = submission?.id;
      if (!activeSubId) {
        // Ensure a draft submission row exists in DB to get its UUID
        const draftRes = await fetch(`/api/organizer-verification/${organizer.id}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents, submitter_notes: notes }),
        });
        const draftData = await draftRes.json();
        if (draftRes.ok && draftData.submission) {
          setSubmission(draftData.submission);
          activeSubId = draftData.submission.id;
        } else {
          throw new Error(draftData.error ?? "Failed to initialize submission draft.");
        }
      }

      // 1. Get signed upload URL from API using activeSubId
      const res = await fetch(`/api/organizer-verification/${organizer.id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: reqItem.type,
          fileName: file.name,
          fileSize: file.size,
          submission_id: activeSubId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initialize upload.");

      // 2. Upload file to Supabase Storage signed URL
      const uploadRes = await fetch(data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload document file.");
      }

      // 3. Update documents state (replace if doc_type already present)
      const newDoc: SubmittedDoc = {
        doc_type: reqItem.type,
        storage_path: data.path,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
      };

      const filtered = documents.filter((d) => d.doc_type !== reqItem.type);
      const updatedDocs = [...filtered, newDoc];
      setDocuments(updatedDocs);

      // 4. Save draft to DB
      await saveDraft(updatedDocs, notes);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingType(null);
    }
  }

  // Handle final submission
  async function handleSubmit() {
    if (!submission?.id) {
      setSubmitError("No active submission found to submit.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/organizer-verification/${organizer.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");

      setSubmission(data.submission);
      setViewMode("gate");
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle starting a fresh submission after rejection
  async function handleStartFresh() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizer-verification/${organizer.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create_new: true }),
      });
      const data = await res.json();
      if (res.ok && data.submission) {
        setSubmission(data.submission);
        setDocuments([]);
        setNotes("");
        setAcknowledged(false);
        setStep(1);
        setViewMode("wizard");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GATE VIEWS (STEP 0)
  // ───────────────────────────────────────────────────────────────────────────

  if (viewMode === "gate") {
    // 1. Verified State
    if (organizer.status === "verified") {
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md">
              <ShieldCheck className="h-9 w-9" />
            </div>
            <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-800">
              Verified Organization
            </span>
            <h1 className="mt-3 text-2xl font-black text-emerald-950">
              {organizer.name} is Verified
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium text-emerald-800">
              Your organization has been officially verified by our moderation team. The verified checkmark badge is active on your public profile.
            </p>
            {organizer.verified_at && (
              <p className="mt-4 text-xs font-bold text-emerald-700">
                Verified on {new Date(organizer.verified_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href={`/dashboard/org/${organizer.id}/overview`}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // 2. Under Review State
    if (submission?.status === "submitted") {
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-4 border-b border-zinc-100 pb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Clock className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-blue-700">
                  Verification Pending
                </span>
                <h1 className="mt-1 text-xl font-black text-zinc-950">
                  Submission Under Review
                </h1>
                <p className="text-xs font-medium text-zinc-500">
                  Submitted on {new Date(submission.submitted_at ?? submission.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>

            <p className="text-sm font-medium text-zinc-600 leading-relaxed">
              Thank you for submitting your verification documents. Our moderation team is currently reviewing your application. Reviews typically take 1–2 business days.
            </p>

            {/* Submitted Documents Summary */}
            <div className="mt-6 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Submitted Documents ({submission.documents.length})
              </h3>
            <div className="divide-y divide-zinc-100 border-y border-zinc-100">
                {submission.documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-zinc-500" />
                      <div>
                        <p className="font-bold text-zinc-900">{doc.file_name ?? "Verification Document"}</p>
                        <p className="text-[10px] text-zinc-400 capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Uploaded
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t border-zinc-100 pt-6">
              <Link
                href={`/dashboard/org/${organizer.id}/overview`}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // 3. Needs More Info State
    if (submission?.status === "needs_more_info") {
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-amber-300 bg-amber-50/50 p-8 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-amber-200 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-amber-900">
                  Action Required
                </span>
                <h1 className="mt-1 text-xl font-black text-amber-950">
                  More Information Requested by Reviewer
                </h1>
                <p className="mt-1 text-xs font-medium text-amber-800">
                  Our team reviewed your submission and needs additional details or updated documents.
                </p>
              </div>
            </div>

            {/* Prominent Reviewer Feedback Callout */}
            {submission.reviewer_notes && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-white p-5 shadow-xs">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700 mb-1">
                  Reviewer Notes:
                </p>
                <p className="text-sm font-semibold text-zinc-800 leading-relaxed italic">
                  &ldquo;{submission.reviewer_notes}&rdquo;
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep(2);
                  setViewMode("wizard");
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700 transition shadow-sm"
              >
                Update &amp; Resubmit Documents
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href={`/dashboard/org/${organizer.id}/overview`}
                className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100/50 transition"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // 4. Rejected State
    if (submission?.status === "rejected") {
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-8 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm">
                <XCircle className="h-6 w-6" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-red-700">
                  Verification Rejected
                </span>
                <h1 className="mt-1 text-xl font-black text-zinc-950">
                  Previous Submission Not Approved
                </h1>
                <p className="mt-1 text-xs font-medium text-zinc-500">
                  Your verification attempt was reviewed and rejected. You may review feedback and start a fresh request.
                </p>
              </div>
            </div>

            {submission.reviewer_notes && (
              <div className="mb-6 rounded-xl border border-red-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-wider text-red-700 mb-1">
                  Reason for Rejection:
                </p>
                <p className="text-sm font-semibold text-zinc-800 leading-relaxed italic">
                  &ldquo;{submission.reviewer_notes}&rdquo;
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={handleStartFresh}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start New Verification Attempt"}
              </button>
              <Link
                href={`/dashboard/org/${organizer.id}/overview`}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // WIZARD FLOW (STEPS 1–4)
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <Link
            href={`/dashboard/org/${organizer.id}/overview`}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Organization
          </Link>
          <h1 className="text-2xl font-black text-zinc-950">Organization Verification</h1>
          <p className="text-xs font-medium text-zinc-500">
            Submit documentation to receive the verified organization badge.
          </p>
        </div>
      </header>

      {/* Stepper Progress Indicator */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-xs font-black shadow-xs">
        {[
          { number: 1, label: "Requirements" },
          { number: 2, label: "Upload Docs" },
          { number: 3, label: "Context" },
          { number: 4, label: "Review" },
        ].map((s) => {
          const isDone = step > s.number;
          const isCurrent = step === s.number;
          return (
            <div key={s.number} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
                  isDone
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                    ? "bg-orange-600 text-white"
                    : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : s.number}
              </div>
              <span className={isCurrent ? "text-zinc-950 font-black" : "text-zinc-400 font-bold"}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* STEP 1: REQUIREMENTS */}
      {step === 1 && (
        <div className="space-y-6 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-lg font-black text-zinc-950">Step 1: Verification Requirements</h2>
            <p className="text-xs font-medium text-zinc-500">
              Required documents for organization type: <strong className="capitalize text-orange-600">{organizer.org_type ?? "Organization"}</strong>
            </p>
          </div>

          <div className="space-y-3">
            {requirements.map((req) => (
              <div
                key={req.type}
                className="flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4"
              >
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-zinc-900 text-sm">{req.label}</p>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                        req.required ? "bg-orange-100 text-orange-700" : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {req.required ? "Required" : "Optional"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{req.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-xs font-bold text-zinc-700 leading-relaxed">
                I understand the document requirements and confirm that I am an authorized representative of {organizer.name}.
              </span>
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!acknowledged}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
            >
              Continue to Document Upload
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: UPLOAD DOCUMENTS */}
      {step === 2 && (
        <div className="space-y-6 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-lg font-black text-zinc-950">Step 2: Upload Documents</h2>
            <p className="text-xs font-medium text-zinc-500">
              Upload clear PDF files or images for each required document type.
            </p>
          </div>

          {uploadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {uploadError}
            </div>
          )}

          <div className="space-y-4">
            {requirements.map((req) => {
              const uploadedDoc = documents.find((d) => d.doc_type === req.type);
              const isUploading = uploadingType === req.type;

              return (
                <div
                  key={req.type}
                  className={`rounded-xl border p-4 transition ${
                    uploadedDoc
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-zinc-900 text-sm">{req.label}</p>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                            req.required ? "bg-orange-100 text-orange-700" : "bg-zinc-200 text-zinc-600"
                          }`}
                        >
                          {req.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">{req.description}</p>
                    </div>

                    {/* Upload Controls */}
                    <div>
                      {uploadedDoc ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            {uploadedDoc.file_name ?? "Uploaded"}
                          </span>
                          <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition">
                            Replace
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(req, file);
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-black text-white hover:bg-orange-600 transition disabled:opacity-50">
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" />
                              Upload File
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(req, file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!isAllRequiredUploaded}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
            >
              Next: Context &amp; Notes
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CONTEXT & NOTES */}
      {step === 3 && (
        <div className="space-y-6 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-lg font-black text-zinc-950">Step 3: Context &amp; Details</h2>
            <p className="text-xs font-medium text-zinc-500">
              Confirm known organization details and add optional notes for our review team.
            </p>
          </div>

          {/* Read-Only Info — open record grid, labels carry hierarchy. */}
          <div className="space-y-3 border-t border-zinc-100 pt-4">
            <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-400">
              <Building2 className="h-4 w-4 text-orange-600" />
              Organization Record Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-bold text-zinc-400 uppercase text-[10px]">Organization Name</p>
                <p className="font-black text-zinc-900 mt-0.5">{organizer.name}</p>
              </div>
              <div>
                <p className="font-bold text-zinc-400 uppercase text-[10px]">Org Type</p>
                <p className="font-black text-zinc-900 mt-0.5 capitalize">{organizer.org_type ?? "other"}</p>
              </div>
              <div>
                <p className="font-bold text-zinc-400 uppercase text-[10px]">Tax ID / EIN</p>
                <p className="font-medium text-zinc-800 mt-0.5">{organizer.tax_id || "Not specified"}</p>
              </div>
              <div>
                <p className="font-bold text-zinc-400 uppercase text-[10px]">Registration Number</p>
                <p className="font-medium text-zinc-800 mt-0.5">{organizer.nonprofit_registration_number || "Not specified"}</p>
              </div>
            </div>
          </div>

          {/* Submitter Notes */}
          <div>
            <label className="block text-xs font-black uppercase text-zinc-600 mb-1.5">
              Submitter Notes (Optional)
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide any additional context, website links, registration notes, or details that will assist our moderation team during review..."
              className="w-full rounded-xl border border-zinc-200 p-3 text-sm font-medium focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={async () => {
                await saveDraft(documents, notes);
                setStep(4);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 transition"
            >
              Next: Review &amp; Submit
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW & SUBMIT */}
      {step === 4 && (
        <div className="space-y-6 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-lg font-black text-zinc-950">Step 4: Review &amp; Submit</h2>
            <p className="text-xs font-medium text-zinc-500">
              Review your application details before submitting for moderation.
            </p>
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {submitError}
            </div>
          )}

          {/* Attached Documents List */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
              Attached Documents ({documents.length})
            </h3>
            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-zinc-50/50">
              {documents.map((doc) => (
                <div key={doc.doc_type} className="flex items-center justify-between p-3.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-orange-600" />
                    <div>
                      <p className="font-bold text-zinc-900">{doc.file_name ?? "Document File"}</p>
                      <p className="text-[10px] text-zinc-400 capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Ready
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Submitter Notes Summary */}
          {notes && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-1.5">
                Submitter Notes
              </h3>
              <div className="border-t border-zinc-100 pt-3 text-xs font-medium text-zinc-800 leading-relaxed">
                {notes}
              </div>
            </div>
          )}

          {/* Legal Notice */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs font-medium text-blue-900 flex items-start gap-2.5">
            <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
            <p>
              By submitting this verification request, you confirm that all attached documents are valid, legal representations of <strong>{organizer.name}</strong>.
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50 shadow-sm"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Submit Verification Request
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
