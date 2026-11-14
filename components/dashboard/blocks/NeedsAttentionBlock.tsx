"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle as AlertTriangle,
  IconArrowRight as ArrowRight,
  IconClock as Clock,
  IconFileText as FileText,
  IconBell as Bell,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { AttentionItem } from "@/lib/dashboard/account-blocks-registry";

interface NeedsAttentionBlockProps {
  items: AttentionItem[];
}

const CATEGORY_ICONS = {
  pending_request: AlertTriangle,
  upcoming_event: Clock,
  draft: FileText,
} as const;

type GroupKey = "pending_request" | "draft" | "upcoming_event";

function NeedsAttentionGroup({
  title,
  items,
  showMoreLabel,
}: {
  title: string;
  items: AttentionItem[];
  showMoreLabel: (n: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 3);
  const remaining = Math.max(0, items.length - visible.length);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-zinc-700">{title}</h3>
        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
          {items.length}
        </span>
      </div>
      <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
        {visible.map((item) => {
          const Icon = CATEGORY_ICONS[item.category] ?? AlertTriangle;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex min-h-[44px] w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-amber-200/60 bg-white p-3.5 transition hover:border-amber-300 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="block min-w-0 flex-1 truncate text-sm font-bold text-zinc-900">
                      {item.title}
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      {item.badge}
                    </span>
                  </div>
                  <p className="truncate text-xs text-zinc-500">{item.detail}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </Link>
          );
        })}
      </div>
      {remaining > 0 && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-[44px] text-xs font-bold text-brand-700 hover:text-brand-800"
        >
          {showMoreLabel(remaining)}
        </button>
      ) : null}
    </div>
  );
}

export function NeedsAttentionBlock({ items }: NeedsAttentionBlockProps) {
  const t = useTranslations("needsAttention");

  const groups = useMemo(() => {
    const by: Record<GroupKey, AttentionItem[]> = {
      pending_request: [],
      draft: [],
      upcoming_event: [],
    };
    for (const item of items) {
      const key = item.category as GroupKey;
      if (key in by) by[key].push(item);
      else by.upcoming_event.push(item);
    }
    const order: GroupKey[] = ["pending_request", "draft", "upcoming_event"];
    return order
      .map((key) => ({
        key,
        items: by[key],
        title:
          key === "pending_request"
            ? t("pendingRequests")
            : key === "draft"
            ? t("drafts")
            : t("upcomingEvents"),
      }))
      .filter((g) => g.items.length > 0);
  }, [items, t]);

  if (items.length === 0) return null;

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5">
      <header className="flex min-w-0 items-center gap-2.5 pb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-black text-zinc-950">{t("title")}</h2>
          <p className="truncate text-xs text-zinc-600">
            {t("summary", { count: items.length })}
          </p>
        </div>
      </header>

      <div className="min-w-0 space-y-4 pt-1">
        {groups.map((g) => (
          <NeedsAttentionGroup
            key={g.key}
            title={g.title}
            items={g.items}
            showMoreLabel={(n) => t("showMore", { count: n })}
          />
        ))}
      </div>
    </section>
  );
}
