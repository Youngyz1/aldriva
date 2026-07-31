"use client";

import Link from "next/link";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export default function DashboardEmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-14 text-center sm:rounded-2xl sm:px-8 sm:py-20">
      <p className="text-xl font-black text-zinc-950 sm:text-2xl">{title}</p>
      <p className="max-w-md text-xs font-medium text-zinc-500 sm:text-sm">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="rounded-lg bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 sm:rounded-xl sm:px-6 sm:py-3 sm:text-sm"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
