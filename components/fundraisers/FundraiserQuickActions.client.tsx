"use client";
import { useState } from "react";
import Link from "next/link";
import { Megaphone, Share2, Mail, Link as LinkIcon, UserPlus, Zap, Check, Download, ArrowRight, Loader2 } from "lucide-react";

export default function FundraiserQuickActions({ fundraiserId, slug, className }: { fundraiserId: string; slug: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/fundraisers/${slug}` : `/fundraisers/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/dashboard/donations/export?fundraiser_id=${fundraiserId}`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-donations.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // fallback to direct link
      window.open(`/api/dashboard/donations/export?fundraiser_id=${fundraiserId}`, "_blank");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={`rounded-xl border border-zinc-200 bg-white ${className ?? ""}`.trim()}>
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-4">
        <Zap className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-900">Quick Actions</h2>
      </div>
      <div className="p-4">
        <Link href={`/dashboard/fundraisers/${fundraiserId}/updates`} className="group flex min-h-[76px] items-center gap-4 rounded-xl bg-brand-700 px-5 py-4 text-left shadow-xs transition hover:bg-brand-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">Post Update</p>
            <p className="text-xs text-brand-100">Keep donors informed and re-engaged</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white transition-transform group-hover:translate-x-0.5" />
        </Link>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={handleShare} className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-brand-200 hover:bg-brand-50">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white"><Share2 className="h-3.5 w-3.5 text-brand-700" /></div>
            <p className="text-xs font-semibold text-zinc-900">Share Campaign</p>
            <p className="text-[11px] text-zinc-400">Boost your reach</p>
          </button>
          <button type="button" disabled className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left opacity-40">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white"><Mail className="h-3.5 w-3.5 text-zinc-400" /></div>
            <p className="text-xs font-semibold text-zinc-900">Email Donors</p>
            <p className="text-[11px] text-zinc-400">Coming soon</p>
          </button>
          <button type="button" onClick={handleShare} className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-brand-200 hover:bg-brand-50">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white">{copied ? <Check className="h-3.5 w-3.5 text-brand-700" /> : <LinkIcon className="h-3.5 w-3.5 text-brand-700" />}</div>
            <p className="text-xs font-semibold text-zinc-900">{copied ? "Link Copied" : "Copy Link"}</p>
            <p className="text-[11px] text-zinc-400">Share anywhere</p>
          </button>
          <button type="button" disabled className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left opacity-40">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white"><UserPlus className="h-3.5 w-3.5 text-zinc-400" /></div>
            <p className="text-xs font-semibold text-zinc-900">Invite Team</p>
            <p className="text-[11px] text-zinc-400">Coming soon</p>
          </button>
          <button type="button" onClick={handleExport} disabled={exporting} className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-brand-200 hover:bg-brand-50 disabled:opacity-50">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white">{exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-700" /> : <Download className="h-3.5 w-3.5 text-brand-700" />}</div>
            <p className="text-xs font-semibold text-zinc-900">{exporting ? "Preparing…" : "Download Report"}</p>
            <p className="text-[11px] text-zinc-400">CSV of donations</p>
          </button>
          <button type="button" disabled className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left opacity-40">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white"><Zap className="h-3.5 w-3.5 text-zinc-400" /></div>
            <p className="text-xs font-semibold text-zinc-900">Boost Campaign</p>
            <p className="text-[11px] text-zinc-400">Coming soon</p>
          </button>
        </div>
      </div>
    </div>
  );
}
