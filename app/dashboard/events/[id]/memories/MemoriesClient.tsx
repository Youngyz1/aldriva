"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Copy, Download, QrCode, RefreshCw, Trash2, X } from "lucide-react";
import {
  bulkModerateMemories,
  deleteMemories,
  getOrCreateMemorySettings,
  moderateMemory,
  regenerateMemoryToken,
  setMemoryRequireApproval,
  setMemoryUploadsActive,
} from "@/lib/actions/event-memories";

export type MemoryPhotoView = {
  id: string;
  viewUrl: string | null;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: string;
  guestLabel: string | null;
  reportCount: number;
  createdAt: string;
};

type Tab = "pending" | "approved" | "rejected";

function QrPanel({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, url, { width: 200, margin: 1 });
    });
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:flex-row sm:gap-5">
      <canvas ref={canvasRef} className="h-40 w-40 rounded-lg border border-zinc-200" />
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Guest upload link</p>
        <p className="mt-1 break-all text-xs font-semibold text-zinc-700">{url}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Print this QR code or share the link — guests open it on their phones, no account needed.
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              },
              () => {}
            );
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

export default function MemoriesClient({
  eventId,
  eventTitle,
  uploadsEnabled,
  requireApproval,
  uploadUrl,
  photos,
}: {
  eventId: string;
  eventTitle: string;
  uploadsEnabled: boolean;
  requireApproval: boolean;
  uploadUrl: string | null;
  photos: MemoryPhotoView[];
}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(uploadUrl);
  const [enabled, setEnabled] = useState(uploadsEnabled);
  const [approval, setApproval] = useState(requireApproval);

  const counts: Record<Tab, number> = {
    pending: photos.filter((p) => p.status === "pending").length,
    approved: photos.filter((p) => p.status === "approved").length,
    rejected: photos.filter((p) => p.status === "rejected").length,
  };
  const visible = photos.filter((p) => p.status === tab);
  const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await action();
      setNotice(res.ok ? { type: "success", text: done } : { type: "error", text: res.error || "Action failed." });
    } catch {
      setNotice({ type: "error", text: "Action failed. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function enableUploads() {
    await run(async () => {
      const res = await getOrCreateMemorySettings(eventId);
      if (res.ok && res.uploadUrl) {
        setQrUrl(res.uploadUrl);
        setEnabled(true);
        setApproval(res.requireApproval !== false);
      }
      return res;
    }, "Photo uploads enabled — share the QR code with guests.");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-black tracking-tight text-zinc-900">Memories — {eventTitle}</h1>
        <p className="text-sm text-zinc-500">
          Guest photos upload privately and appear here for review. Approved photos download as a ZIP.
        </p>
      </header>

      {notice && (
        <p
          className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
            notice.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* Upload credential */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-zinc-900">
              <QrCode size={16} /> Guest upload QR
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {enabled
                ? "Uploads are open. Approval is required before photos appear in downloads."
                : "Uploads are currently off. Enable them to mint the guest link."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!enabled || !qrUrl ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void enableUploads()}
                className="rounded-xl bg-orange-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-orange-800 active:scale-[0.98] disabled:opacity-60"
              >
                Enable photo uploads
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await regenerateMemoryToken(eventId);
                      if (res.ok && res.uploadUrl) setQrUrl(res.uploadUrl);
                      return res;
                    }, "New upload link issued — the old QR code no longer works.")
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-60"
                >
                  <RefreshCw size={13} /> Regenerate
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await setMemoryUploadsActive(eventId, false);
                      if (res.ok) {
                        setEnabled(false);
                        setQrUrl(null);
                      }
                      return res;
                    }, "Photo uploads disabled.")
                  }
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 shadow-xs hover:bg-red-50 disabled:opacity-60"
                >
                  Disable
                </button>
              </>
            )}
          </div>
        </div>

        {enabled && qrUrl && (
          <div className="mt-4 space-y-3">
            <QrPanel url={qrUrl} />
            <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={approval}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.checked;
                  setApproval(next);
                  void run(() => setMemoryRequireApproval(eventId, next), "Approval setting saved.");
                }}
                className="mt-0.5 h-4 w-4 accent-orange-700"
              />
              <span>
                <span className="font-bold">Require approval</span> — new uploads wait in Pending
                before they can be downloaded. Turn off to auto-approve.
              </span>
            </label>
          </div>
        )}
      </section>

      {/* Moderation tabs */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setSelected(new Set());
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold capitalize shadow-xs transition active:scale-[0.98] ${
                tab === t
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t} <span className="tabular-nums">({counts[t]})</span>
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <Link
              href={`/api/events/${eventId}/memories/zip?status=approved`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-700 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-orange-800"
            >
              <Download size={13} /> Download approved ZIP
            </Link>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <span className="text-xs font-bold text-zinc-700 tabular-nums">{selected.size} selected</span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => bulkModerateMemories(eventId, [...selected], "approved"),
                  "Selected photos approved."
                )
              }
              className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            >
              <Check size={12} /> Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => bulkModerateMemories(eventId, [...selected], "rejected"),
                  "Selected photos rejected."
                )
              }
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            >
              <X size={12} /> Reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Permanently delete ${selected.size} photo(s)?`)) return;
                void run(async () => {
                  const res = await deleteMemories(eventId, [...selected]);
                  if (res.ok) setSelected(new Set());
                  return res;
                }, "Selected photos deleted.");
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center">
            <Camera size={28} className="text-zinc-300" />
            <p className="mt-2 text-sm font-bold text-zinc-700">No {tab} photos</p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              {tab === "pending"
                ? "New guest uploads will wait here for your review."
                : `Nothing ${tab} yet.`}
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
                <div className="relative">
                  {p.viewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.viewUrl} alt={p.guestLabel || "Guest photo"} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-zinc-50 text-zinc-300">
                      <Camera size={24} />
                    </div>
                  )}
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label="Select photo"
                    className="absolute left-2 top-2 h-5 w-5 accent-orange-700"
                  />
                  {p.reportCount > 0 && (
                    <span className="absolute right-2 top-2 rounded-lg bg-red-700 px-2 py-0.5 text-[10px] font-black text-white tabular-nums">
                      {p.reportCount} report{p.reportCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[11px] font-bold text-zinc-800">
                    {p.guestLabel || "Anonymous guest"}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-zinc-500 tabular-nums">
                    {(p.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    {p.width && p.height ? ` · ${p.width}×${p.height}` : ""} ·{" "}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    {p.status !== "approved" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => moderateMemory(eventId, p.id, "approved"), "Photo approved.")}
                        className="flex-1 rounded-lg bg-green-700 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        Approve
                      </button>
                    )}
                    {p.status !== "rejected" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => moderateMemory(eventId, p.id, "rejected"), "Photo rejected.")}
                        className="flex-1 rounded-lg bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-700 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm("Permanently delete this photo?")) return;
                        void run(async () => deleteMemories(eventId, [p.id]), "Photo deleted.");
                      }}
                      aria-label="Delete photo"
                      className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 disabled:opacity-60"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
