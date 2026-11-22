import Link from "next/link";
import { IconHeart as Heart, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { AccountBlockRow } from "./AccountBlockRow";
import type { FundraiserItem } from "@/lib/dashboard/account-blocks-registry";

interface FundraisersBlockProps {
  fundraisers: FundraiserItem[];
}

export function FundraisersBlock({ fundraisers }: FundraisersBlockProps) {
  if (fundraisers.length === 0) return null;

  const showViewAll = fundraisers.length > 3;
  const displayedFundraisers = fundraisers.slice(0, 3);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
            <Heart className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-950">Fundraisers</h2>
            <p className="text-xs text-zinc-500">Campaigns you organize and run</p>
          </div>
        </div>

        {showViewAll && (
          <Link
            href="/dashboard/fundraisers"
            className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline transition"
          >
            <span>View all ({fundraisers.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <div className="divide-y divide-zinc-100 pt-1">
        {displayedFundraisers.map((f) => {
          const raisedStr = `$${f.raisedAmount.toLocaleString()}`;
          const goalStr = f.targetAmount ? ` of $${f.targetAmount.toLocaleString()}` : "";
          const subtitle = `${raisedStr}${goalStr} raised`;

          return (
            <AccountBlockRow
              key={f.id}
              id={f.id}
              title={f.title}
              subtitle={subtitle}
              status={f.status}
              createdAt={f.created_at}
              href={f.href}
              actionLabel="View"
            />
          );
        })}
      </div>
    </section>
  );
}
