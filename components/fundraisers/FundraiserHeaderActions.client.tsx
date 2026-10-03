"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Share2, Pencil, ExternalLink, Trash2, Check } from "lucide-react";

export default function FundraiserHeaderActions({
  fundraiserId,
  slug,
  title,
  hasDonations,
}: {
  fundraiserId: string;
  slug: string;
  title: string;
  hasDonations: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleShare() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/fundraisers/${slug}` : `/fundraisers/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/fundraisers/${fundraiserId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }
      router.push("/dashboard/fundraisers");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleShare} className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          {copied ? <Check className="h-3.5 w-3.5 text-brand-700" /> : <Share2 className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Share"}
        </button>
        <Link href={`/fundraisers/edit/${fundraiserId}`} className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
        <Link href={`/fundraisers/${slug}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-800">
          <ExternalLink className="h-3.5 w-3.5" /> View Page
        </Link>
        <button
          type="button"
          disabled={hasDonations}
          title={hasDonations ? "Campaigns with donations cannot be deleted to preserve payment history." : "Delete fundraiser"}
          onClick={() => setShowConfirm(true)}
          className={hasDonations ? "flex min-h-[40px] cursor-not-allowed items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-400 opacity-60" : "flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{error}</div>}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-base font-bold text-zinc-900">Delete Fundraiser</h3>
            <p className="mt-2 text-sm text-zinc-600">Delete &quot;{title}&quot;? This cannot be undone. Fundraisers with donation payment records are blocked.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConfirm(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
