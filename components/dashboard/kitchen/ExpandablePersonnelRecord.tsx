import type { ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

type Detail = { label: string; value: ReactNode };

export function ExpandablePersonnelRecord({
  name,
  status,
  details,
  children,
}: {
  name: string;
  status: string;
  details: Detail[];
  children: ReactNode;
}) {
  return (
    <li className="py-1">
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
            {name}
          </span>
          <span className="max-w-[55%] truncate rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {status}
          </span>
          <IconChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-open:rotate-180 dark:text-zinc-300"
          />
        </summary>
        <div className="grid gap-4 px-2 pb-4 pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <dt className="text-zinc-600 dark:text-zinc-300">{detail.label}</dt>
                <dd className="mt-0.5 break-words font-medium text-zinc-950 dark:text-zinc-50">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">{children}</div>
        </div>
      </details>
    </li>
  );
}
