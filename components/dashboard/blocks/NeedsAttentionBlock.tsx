import Link from "next/link";
import {
  IconAlertTriangle as AlertTriangle,
  IconArrowRight as ArrowRight,
  IconClock as Clock,
  IconFileText as FileText,
  IconBell as Bell,
} from "@tabler/icons-react";
import type { AttentionItem } from "@/lib/dashboard/account-blocks-registry";

interface NeedsAttentionBlockProps {
  items: AttentionItem[];
}

const CATEGORY_ICONS = {
  pending_request: AlertTriangle,
  upcoming_event: Clock,
  draft: FileText,
};

export function NeedsAttentionBlock({ items }: NeedsAttentionBlockProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5">
      <header className="flex items-center gap-2.5 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-black text-zinc-950">Needs attention</h2>
          <p className="text-xs text-zinc-600">
            {items.length} item{items.length === 1 ? "" : "s"} requiring your action
          </p>
        </div>
      </header>

      <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = CATEGORY_ICONS[item.category] ?? AlertTriangle;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-amber-200/60 bg-white p-3.5 transition hover:border-amber-300 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-zinc-900">
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
    </section>
  );
}
