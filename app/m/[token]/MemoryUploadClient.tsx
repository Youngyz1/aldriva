"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Trash2, UploadCloud } from "lucide-react";

const MAX_BYTES = 15 * 1024 * 1024;

const REPORT_REASONS = [
  "Inappropriate content",
  "Wrong event",
  "Poor quality",
  "Spam",
  "Other",
];

type UploadRecord = {
  id: string;
  status: string;
  viewUrl: string | null;
  deleteToken: string;
  fileName: string;
  message: string;
};

export default function MemoryUploadClient({
  token,
  eventTitle,
  eventMeta,
  requireApproval,
}: {
  token: string;
  eventTitle: string;
  eventMeta: string | null;
  requireApproval: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [guestLabel, setGuestLabel] = useState("");
  const [phase, setPhase] = useState<"idle" | "signing" | "uploading" | "finalizing" | "error">("idle");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0]);

  async function handleFile(file: File) {
    setFeedback(null);
    if (!file.type.startsWith("image/")) {
      setFeedback({ type: "error", text: "Please choose a photo file (JPEG, PNG, WebP, or HEIC)." });
      return;
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      setFeedback({ type: "error", text: "Photos must be under 15 MB." });
      return;
    }

    try {
      setPhase("signing");
      const signRes = await fetch(`/api/memories/${token}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
      });
      const signData = await signRes.json();
      if (!signRes.ok || !signData.url || !signData.key) {
        throw new Error(signData.error || "Could not prepare the upload.");
      }

      setPhase("uploading");
      const putRes = await fetch(signData.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload interrupted. Please try again.");

      setPhase("finalizing");
      const doneRes = await fetch(`/api/memories/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: signData.key, guestLabel: guestLabel.trim() || undefined }),
      });
      const doneData = await doneRes.json();
      if (!doneRes.ok || !doneData.id) {
        throw new Error(doneData.error || "Could not save your photo.");
      }

      setUploads((prev) => [
        {
          id: doneData.id,
          status: doneData.status,
          viewUrl: doneData.viewUrl ?? null,
          deleteToken: doneData.deleteToken,
          fileName: file.name,
          message: doneData.message,
        },
        ...prev,
      ]);
      setFeedback({ type: "success", text: doneData.message });
      setPhase("idle");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed. Please try again.",
      });
      setPhase("error");
    }
  }

  async function handleDeleteOwn(record: UploadRecord) {
    if (!confirm("Delete this photo permanently?")) return;
    setDeletingId(record.id);
    try {
      const res = await fetch(`/api/memories/photo/${record.deleteToken}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      setUploads((prev) => prev.filter((u) => u.id !== record.id));
      setFeedback({ type: "success", text: "Your photo was deleted." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Delete failed. Please try again.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReport(record: UploadRecord) {
    setReportingId(record.id);
    try {
      const res = await fetch(`/api/memories/${token}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: record.id, reason: reportReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Report failed.");
      setFeedback({ type: "success", text: data.message });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Report failed. Please try again.",
      });
    } finally {
      setReportingId(null);
    }
  }

  const busy = phase === "signing" || phase === "uploading" || phase === "finalizing";
  const phaseLabel =
    phase === "signing"
      ? "Preparing upload…"
      : phase === "uploading"
        ? "Uploading…"
        : phase === "finalizing"
          ? "Processing photo…"
          : "Choose a photo";

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-zinc-900 sm:py-16">
      <div className="mx-auto w-full max-w-lg">
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-orange-700 text-white shadow-xs">
            <Camera size={26} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{eventTitle}</h1>
          {eventMeta && <p className="mt-1 text-sm font-medium text-zinc-500">{eventMeta}</p>}
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Share your photos with the organizer.
            {requireApproval
              ? " Photos appear after a quick review."
              : " Photos appear right away."}{" "}
            Max 15 MB per photo.
          </p>
        </header>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <label htmlFor="memory-guest-label" className="mb-1.5 block text-xs font-bold text-zinc-700">
            Your name <span className="font-medium text-zinc-400">(optional)</span>
          </label>
          <input
            id="memory-guest-label"
            type="text"
            value={guestLabel}
            onChange={(e) => setGuestLabel(e.target.value.slice(0, 80))}
            placeholder="e.g. Amara"
            className="mb-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-700 focus:outline-none"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-orange-800 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
            {phaseLabel}
          </button>
          {feedback && (
            <p
              className={`mt-3 flex items-start gap-1.5 text-xs font-semibold leading-relaxed ${
                feedback.type === "success" ? "text-green-700" : "text-red-600"
              }`}
            >
              {feedback.type === "success" && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
              {feedback.text}
            </p>
          )}
        </div>

        {uploads.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500">
              Your uploads this visit
            </h2>
            <ul className="space-y-3">
              {uploads.map((u) => (
                <li
                  key={u.id}
                  className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs"
                >
                  {u.viewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.viewUrl}
                      alt={u.fileName}
                      className="h-20 w-20 shrink-0 rounded-lg border border-zinc-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400">
                      <Camera size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-zinc-800">{u.fileName}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                      {u.status === "approved" ? "Visible to the organizer" : "Pending organizer review"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={deletingId === u.id}
                        onClick={() => void handleDeleteOwn(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        <Trash2 size={12} />
                        {deletingId === u.id ? "Deleting…" : "Delete"}
                      </button>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600"
                        aria-label="Report reason"
                      >
                        {REPORT_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={reportingId === u.id}
                        onClick={() => void handleReport(u)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {reportingId === u.id ? "Reporting…" : "Report"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
