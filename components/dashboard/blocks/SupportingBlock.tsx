import Link from "next/link";
import {
  IconHeartHandshake as HeartHandshake,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { AccountBlockRow } from "./AccountBlockRow";
import type { SupportingItem } from "@/lib/dashboard/account-blocks-registry";

interface SupportingBlockProps {
  supporting: SupportingItem[];
}

export function SupportingBlock({ supporting }: SupportingBlockProps) {
  if (supporting.length === 0) return null;

  const showViewAll = supporting.length > 3;
  const displayedSupporting = supporting.slice(0, 3);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
            <HeartHandshake className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-950">Supporting</h2>
            <p className="text-xs text-zinc-500">Tickets you bought and causes you backed</p>
          </div>
        </div>

        {showViewAll && (
          <Link
            href="/dashboard/donations"
            className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline transition"
          >
            <span>View all ({supporting.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <div className="divide-y divide-zinc-100 pt-1">
        {displayedSupporting.map((item) => (
          <AccountBlockRow
            key={`${item.type}-${item.id}`}
            id={item.id}
            title={item.title}
            subtitle={item.detail}
            status={item.status}
            createdAt={item.created_at}
            href={item.href}
            actionLabel="View"
          />
        ))}
      </div>
    </section>
  );
}
