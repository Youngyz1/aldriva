"use client";

import { useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

export function ProgressiveDisclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group border-b border-border py-2"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-brand-600 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-semibold text-foreground">{title}</span>
        <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {summary}
          <IconChevronDown
            aria-hidden="true"
            className="h-4 w-4 text-zinc-600 transition-transform group-open:rotate-180 dark:text-zinc-300"
          />
        </span>
      </summary>
      {open && <div className="pt-3">{children}</div>}
    </details>
  );
}
