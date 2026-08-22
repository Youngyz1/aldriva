"use client";

import { useState } from "react";
import Link from "next/link";
import { type Campaign } from "@/lib/fund4good-data";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getSiteUrl } from "@/lib/site-url";
import { useDashboardExport } from "@/hooks/use-dashboard-export";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Share2,
  Mail,
  Link as LinkIcon,
  UserPlus,
  Zap,
  Check,
  Download,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface QuickActionsProps {
  campaign: Campaign;
  className?: string;
}

export function QuickActions({ campaign, className }: QuickActionsProps) {
  const [copied, setCopied] = useState(false);
  const { exporting, exportCsv } = useDashboardExport();
  const shareUrl = `${getSiteUrl()}/fundraisers/${campaign.slug}`;

  async function handleShare() {
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleDownloadReport() {
    await exportCsv(
      `/api/dashboard/donations/export?campaign=${campaign.id}`,
      `${campaign.slug}-donations.csv`
    );
  }

  const secondaryTiles: Array<{
    id: string;
    label: string;
    description: string;
    icon: React.ElementType;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }> = [
    {
      id: "share-campaign",
      label: "Share Campaign",
      description: "Boost your reach",
      icon: Share2,
      onClick: handleShare,
    },
    {
      id: "email-donors",
      label: "Email Donors",
      description: "Coming soon",
      icon: Mail,
      disabled: true,
    },
    {
      id: "copy-link",
      label: copied ? "Link Copied" : "Copy Link",
      description: "Share anywhere",
      icon: copied ? Check : LinkIcon,
      onClick: handleShare,
    },
    {
      id: "invite-team",
      label: "Invite Team",
      description: "Coming soon",
      icon: UserPlus,
      disabled: true,
    },
    {
      id: "download-report",
      label: exporting ? "Preparing…" : "Download Report",
      description: "CSV of donations",
      icon: exporting ? Loader2 : Download,
      onClick: handleDownloadReport,
      disabled: exporting,
      loading: exporting,
    },
    {
      id: "boost",
      label: "Boost Campaign",
      description: "Coming soon",
      icon: Zap,
      disabled: true,
    },
  ];

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Zap className="h-4 w-4 text-slate-400" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
      </div>

      <div className="p-4">
        {/* Primary action */}
        <Link
          href={`/dashboard/fundraisers/${campaign.id}/updates`}
          className="group flex min-h-[76px] items-center gap-4 rounded-xl bg-brand-700 px-5 py-4 text-left shadow-sm transition-all duration-150 hover:bg-brand-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Megaphone className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">Post Update</p>
            <p className="text-xs text-brand-100">Keep donors informed and re-engaged</p>
          </div>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-white transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>

        {/* Secondary actions */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {secondaryTiles.map((tile) => {
            const Icon = tile.icon;
            const classes = cn(
              "group flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-all duration-150",
              "hover:border-brand-200 hover:bg-brand-50 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
            );
            const inner = (
              <>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white transition-colors group-hover:border-brand-200 group-hover:bg-brand-100"
                  aria-hidden
                >
                  <Icon className={cn("h-3.5 w-3.5 text-brand-700", tile.loading && "animate-spin")} />
                </div>
                <div>
                  <p className="text-xs font-semibold leading-none text-slate-900">{tile.label}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{tile.description}</p>
                </div>
              </>
            );

            if (tile.href && !tile.disabled) {
              return (
                <Link key={tile.id} href={tile.href} className={classes} aria-label={`${tile.label}: ${tile.description}`}>
                  {inner}
                </Link>
              );
            }

            return (
              <button
                key={tile.id}
                type="button"
                disabled={tile.disabled}
                onClick={tile.onClick}
                title={tile.disabled && !tile.loading ? "Not available yet" : undefined}
                className={classes}
                aria-label={`${tile.label}: ${tile.description}`}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
