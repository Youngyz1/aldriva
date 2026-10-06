"use client";

/**
 * components/invitation/InvitationSection.tsx
 *
 * One collapsible builder section. The header is a native button (keyboard
 * operable by construction) with `aria-expanded` + `aria-controls`; the
 * body region is labelled by the header. Collapsed sections show a short
 * status summary so hosts can scan completeness at a glance.
 */

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  index: number;
  title: string;
  /** Short completeness summary shown when collapsed (e.g. "Image set · focal 50/50"). */
  summary?: string | null;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

export function InvitationSection({ id, index, title, summary, open, onToggle, children }: Props) {
  const headerId = `inv-section-header-${id}`;
  const panelId = `inv-section-panel-${id}`;
  return (
    <section aria-labelledby={headerId} className="border-b border-zinc-200 pb-1">
      <h2 className="m-0">
        <button
          id={headerId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(id)}
          className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-zinc-50/60 rounded-lg px-1"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-black text-zinc-600 tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-zinc-900">{title}</span>
            {!open && summary && <span className="block truncate text-[11px] text-zinc-500">{summary}</span>}
          </span>
          <ChevronDown
            size={16}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
          />
        </button>
      </h2>
      {open && (
        <div id={panelId} role="region" aria-labelledby={headerId} className="border-t border-zinc-100 px-1 py-4">
          {children}
        </div>
      )}
    </section>
  );
}
