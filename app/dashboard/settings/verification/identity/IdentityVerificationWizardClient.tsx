"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ArrowRight,
  ArrowLeft,
  X,
  Loader2,
} from "lucide-react";
import type { UserIdentityVerificationRow, UserIdentityDoc } from "@/lib/identity-verifications";

type ProfileData = {
  identity_status: string;
  identity_verified_at: string | null;
};

const ID_TYPES = [
  {
    type: "national_id",
    title: "National ID Card / Resident Card",
    desc: "Government-issued national identity card (front and back required).",
    requiresBack: true,
  },
  {
    type: "passport",
    title: "International Passport",
    desc: "Valid passport photo/data page.",
    requiresBack: false,
  },
  {
    type: "drivers_license",
    title: "Driver's License",
    desc: "Valid driver's license (front and back required).",
    requiresBack: true,
  },
] as const;

export default function IdentityVerificationWizardClient({
  user,
  profile,
  initialSubmission,
}: {
  user: any;
  profile: ProfileData;
  initialSubmission: UserIdentityVerificationRow | null;
}) {
  const [submission, setSubmission] = useState<UserIdentityVerificationRow | null>(initialSubmission);
  const [step, setStep] = useState<number>(1);
  const [idType, setIdType] = useState<"national_id" | "passport" | "drivers_license">(
    initialSubmission?.id_type ?? "national_id"
  );
  const [documents, setDocuments] = useState<UserIdentityDoc[]>(
    initialSubmission?.documents ?? []
  );
  const [submitterNotes, setSubmitterNotes] = useState<string>(
    initialSubmission?.submitter_notes ?? ""
  );

  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedIdConfig = ID_TYPES.find((t) => t.type === idType) ?? ID_TYPES[0];

  const frontUploaded = documents.some((d) => d.doc_type === "id_front");
  const backUploaded = documents.some((d) => d.doc_type === "id_back");

  const isStep2Complete = selectedIdConfig.requiresBack
    ? frontUploaded && backUploaded
    : frontUploaded;

  // Gate Check State Renderers
  if (profile.identity_status === "verified") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-emerald-950">Your Identity is Verified</h1>
          <p className="mt-2 text-sm font-medium text-emerald-800">
            Your personal identity has been verified. You can now host fundraisers and request payouts seamlessly.
          </p>
          {profile.identity_verified_at && (
            <p className="mt-2 text-xs text-emerald-700">
              Verified on {new Date(profile.identity_verified_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-4">
            <Link href="/dashboard/settings/profile" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700">
              Go to Profile Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submission?.status === "submitted") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Clock className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-amber-950">Verification Under Review</h1>
          <p className="mt-2 text-sm font-medium text-amber-800">
            Your identity document submission was received on{" "}
            {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "recently"}{" "}
            and is currently being reviewed by our trust &amp; safety team.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link href="/dashboard" className="rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-amber-700">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Handle direct file upload to Supabase Storage signed URL
  async function handleFileUpload(docType: "id_front" | "id_back", file: File) {
    setUploadingDocType(docType);
    setUploadError(null);

    try {
      let activeSubId = submission?.id;
      if (!activeSubId) {
        const draftRes = await fetch("/api/identity-verification/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_type: idType, documents, submitter_notes: submitterNotes }),
        });
        const draftData = await draftRes.json();
        if (draftRes.ok && draftData.submission) {
          setSubmission(draftData.submission);
          activeSubId = draftData.submission.id;
        } else {
          throw new Error(draftData.error ?? "Failed to initialize draft.");
        }
      }

      // 1. Get signed upload URL
      const urlRes = await fetch("/api/identity-verification/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: docType,
          fileName: file.name,
          fileSize: file.size,
          submission_id: activeSubId,
        }),
      });

      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error ?? "Failed to get upload URL.");

      // 2. HTTP PUT upload directly to Supabase Storage
      const putRes = await fetch(urlData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) throw new Error("Failed to upload document file.");

      // 3. Update local state & auto-save draft
      const newDoc: UserIdentityDoc = {
        doc_type: docType,
        storage_path: urlData.path,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
      };

      const updatedDocs = [...documents.filter((d) => d.doc_type !== docType), newDoc];
      setDocuments(updatedDocs);

      // Auto-save draft
      await fetch("/api/identity-verification/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_type: idType, documents: updatedDocs, submitter_notes: submitterNotes }),
      });
    } catch (err: any) {
      setUploadError(err.message || "File upload failed.");
    } finally {
      setUploadingDocType(null);
    }
  }

  // Handle final submission
  async function handleSubmit() {
    if (!submission?.id) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/identity-verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit verification.");

      setSubmission(data.submission);
    } catch (err: any) {
      setSubmitError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-600">
          <ShieldCheck className="h-4 w-4" /> Personal Identity Verification
        </div>
        <h1 className="mt-1 text-2xl font-black text-zinc-950">Verify Your Identity</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          Upload a valid government-issued ID to verify your profile and unlock payout capabilities.
        </p>
      </div>

      {/* Reviewer Notes callout for needs_more_info or rejected */}
      {submission?.status === "needs_more_info" && submission.reviewer_notes && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-center gap-2 text-sm font-black">
            <AlertCircle className="h-4 w-4 text-amber-600" /> Action Required: Additional Info Requested
          </div>
          <p className="mt-1 text-xs font-medium text-amber-800">{submission.reviewer_notes}</p>
        </div>
      )}

      {submission?.status === "rejected" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <div className="flex items-center gap-2 text-sm font-black">
            <X className="h-4 w-4 text-rose-600" /> Previous Verification Submission Was Rejected
          </div>
          {submission.reviewer_notes && (
            <p className="mt-1 text-xs font-medium text-rose-800">Reason: {submission.reviewer_notes}</p>
          )}
          <p className="mt-2 text-xs font-bold text-rose-700">
            Please submit a clear, valid government document below to try again.
          </p>
        </div>
      )}

      {/* Step Indicators */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1, label: "Select ID Type" },
          { num: 2, label: "Upload Documents" },
          { num: 3, label: "Review & Submit" },
        ].map((s) => (
          <div
            key={s.num}
            className={`rounded-xl border p-3 text-center transition ${
              step === s.num
                ? "border-brand-600 bg-brand-50/50 text-brand-900"
                : step > s.num
                ? "border-emerald-200 bg-emerald-50/30 text-emerald-800"
                : "border-zinc-200 bg-white text-zinc-400"
            }`}
          >
            <span className="text-xs font-black uppercase">Step {s.num}</span>
            <p className="text-xs font-bold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* STEP 1: Select ID Type — radio options keep their selected-state boundaries. */}
      {step === 1 && (
        <div className="space-y-4 border-t border-zinc-200 pt-6">
          <h2 className="text-base font-black text-zinc-950">Choose Government ID Type</h2>

          <div className="space-y-3">
            {ID_TYPES.map((t) => (
              <label
                key={t.type}
                className={`flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition ${
                  idType === t.type
                    ? "border-brand-600 bg-brand-50/30 ring-2 ring-brand-500/20"
                    : "border-zinc-200 bg-zinc-50 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="id_type"
                  checked={idType === t.type}
                  onChange={() => setIdType(t.type)}
                  className="mt-1 accent-brand-600"
                />
                <div>
                  <span className="block text-sm font-bold text-zinc-900">{t.title}</span>
                  <span className="block text-xs text-zinc-500 font-medium mt-0.5">{t.desc}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-brand-700"
            >
              Continue to Upload <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Document Upload — upload tiles keep their own boundaries. */}
      {step === 2 && (
        <div className="space-y-6 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-base font-black text-zinc-950">Upload Document Images</h2>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Upload clear, uncropped photos or PDF scans of your {selectedIdConfig.title}. Max file size: 10MB per document.
            </p>
          </div>

          {uploadError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
              {uploadError}
            </div>
          )}

          <div className="space-y-4 border-t border-zinc-100 pt-4">
            {/* Front Upload */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900">
                    {selectedIdConfig.type === "passport" ? "Passport Data Page *" : "ID Front Photo *"}
                  </span>
                  <p className="text-[11px] text-zinc-500 font-medium">Front side containing photo and full name.</p>
                </div>
                {frontUploaded && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                  </span>
                )}
              </div>

              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                disabled={uploadingDocType === "id_front"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload("id_front", f);
                }}
                className="block w-full text-xs text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-brand-700"
              />

            {/* Back Upload (conditional) */}
            {selectedIdConfig.requiresBack && (
              <div className="space-y-3 border-t border-zinc-100 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-zinc-900">ID Back Photo *</span>
                    <p className="text-[11px] text-zinc-500 font-medium">Back side containing address or serial numbers.</p>
                  </div>
                  {backUploaded && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                    </span>
                  )}
                </div>

                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={uploadingDocType === "id_back"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload("id_back", f);
                  }}
                  className="block w-full text-xs text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-brand-700"
                />
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            <button
              disabled={!isStep2Complete}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              Review Submission <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Review & Submit — summary rows use dividers, no outer box. */}
      {step === 3 && (
        <div className="space-y-6 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-base font-black text-zinc-950">Review Your Verification Submission</h2>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Confirm your document details before submitting to our verification review queue.
            </p>
          </div>

          {submitError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
              {submitError}
            </div>
          )}

          <div className="space-y-3 border-t border-zinc-100 pt-4 text-xs">
            <div className="flex justify-between border-b border-zinc-200 pb-2">
              <span className="font-bold text-zinc-500">ID Type:</span>
              <span className="font-black text-zinc-900">{selectedIdConfig.title}</span>
            </div>

            <div className="space-y-1 pt-1">
              <span className="font-bold text-zinc-500">Uploaded Files:</span>
              <ul className="space-y-1">
                {documents.map((d) => (
                  <li key={d.storage_path} className="flex items-center gap-2 text-zinc-800 font-medium">
                    <FileText className="h-3.5 w-3.5 text-brand-600" />
                    <span>{d.doc_type === "id_front" ? "Front:" : "Back:"}</span>
                    <span className="font-bold">{d.file_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-zinc-600">Notes for Reviewer (Optional)</span>
            <textarea
              value={submitterNotes}
              onChange={(e) => setSubmitterNotes(e.target.value)}
              rows={3}
              placeholder="Any additional context about your document..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs outline-none focus:border-orange-500 focus:bg-white"
            />
          </label>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Uploads
            </button>

            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Submit Identity Verification
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
