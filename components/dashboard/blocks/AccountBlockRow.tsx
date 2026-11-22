import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/format-date";

interface AccountBlockRowProps {
  id: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  createdAt: string;
  href: string;
  actionLabel?: string;
  isDraftGroup?: boolean;
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export function AccountBlockRow({
  title,
  subtitle,
  status,
  createdAt,
  href,
  actionLabel = "View",
  isDraftGroup,
}: AccountBlockRowProps) {
  const statusKey = (status ?? "").toLowerCase();
  const badgeStyle = STATUS_BADGE_STYLES[statusKey] ?? "bg-zinc-100 text-zinc-600 border-zinc-200";

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-zinc-100 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={href}
            className="block truncate text-sm font-bold text-zinc-900 hover:text-orange-700 transition"
          >
            {title}
          </Link>
          {status && !isDraftGroup && (
            <span
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}
            >
              {status}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {subtitle ? <span>{subtitle} · </span> : null}
          {formatDisplayDate(createdAt)}
        </p>
      </div>

      <Button
        asChild
        size="sm"
        variant="outline"
        className="shrink-0 min-h-[44px] min-w-[64px] rounded-xl text-xs font-bold hover:border-orange-200 hover:text-orange-700 transition"
      >
        <Link href={href} aria-label={`${actionLabel} ${title}`}>
          {actionLabel}
        </Link>
      </Button>
    </div>
  );
}
