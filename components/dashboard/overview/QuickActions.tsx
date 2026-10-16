"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Utensils,
  Briefcase,
  Globe,
  ExternalLink,
  Copy,
  Calendar,
  Heart,
  Check,
  ShieldCheck,
} from "lucide-react";
import type { QuickActionItem } from "@/lib/overview-types";

export interface QuickActionsProps {
  actions: QuickActionItem[];
  organizerId: string;
  additionalAction?: ReactNode;
}

const ICON_MAP: Record<string, typeof Utensils> = {
  Utensils,
  Briefcase,
  Globe,
  ExternalLink,
  Copy,
  Calendar,
  Heart,
  ShieldCheck,
};

export function QuickActions({ actions, organizerId, additionalAction }: QuickActionsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if ((!actions || actions.length === 0) && !additionalAction) return null;

  function handleCopy(action: QuickActionItem) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const url = action.href.startsWith("http")
        ? action.href
        : `${window.location.origin}${action.href}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(action.id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    }
  }

  // Resolve placeholders in href
  const resolveHref = (path: string) => {
    return path
      .replace("MENU_PATH", `${organizerId}/menu`)
      .replace("SERVICES_PATH", `${organizerId}/services`)
      .replace("BUILDER_PATH", `${organizerId}/website/builder`)
      .replace("SETTINGS_PATH", `${organizerId}/settings`);
  };

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-3">
      <h2 id="quick-actions-heading" className="text-sm font-black uppercase tracking-wider text-zinc-400">
        Quick Actions
      </h2>

      <div className="flex flex-wrap gap-2.5">
        {(actions ?? []).map((act) => {
          const Icon = ICON_MAP[act.icon] ?? Globe;
          const isCopied = copiedId === act.id;

          if (act.id === "copy_link") {
            return (
              <button
                key={act.id}
                type="button"
                onClick={() => handleCopy(act)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition active:scale-95"
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Link copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-zinc-500" />
                    <span>{act.label}</span>
                  </>
                )}
              </button>
            );
          }

          const isPrimary = act.variant === "primary";
          const isOutline = act.variant === "outline";

          const buttonCls = isPrimary
            ? "bg-orange-700 text-white hover:bg-orange-800 shadow-xs"
            : isOutline
            ? "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 shadow-xs"
            : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-xs";

          return (
            <Link
              key={act.id}
              href={resolveHref(act.href)}
              target={act.external ? "_blank" : undefined}
              rel={act.external ? "noopener noreferrer" : undefined}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition active:scale-95 ${buttonCls}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{act.label}</span>
            </Link>
          );
        })}
        {additionalAction}
      </div>
    </section>
  );
}
