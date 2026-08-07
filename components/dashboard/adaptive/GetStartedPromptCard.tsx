import Link from "next/link";
import { VERTICAL_CONFIG, type VerticalPrompt } from "@/lib/dashboard-activity";

/**
 * Lighter sibling of StatCard's "unavailable" variant — but actionable
 * rather than muted-forever, since these verticals aren't "not tracked,"
 * they're "not started yet." Deliberately colorless (the vertical's own
 * icon, rendered gray instead of its real tint) until the user actually
 * has data there — a vertical only "earns" its color once it shows up as
 * a real StatCard.
 */
export default function GetStartedPromptCard({ prompt }: { prompt: VerticalPrompt }) {
  const Icon = VERTICAL_CONFIG[prompt.key].icon;

  return (
    <Link
      href={prompt.href}
      className="group flex flex-col gap-2.5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 transition group-hover:bg-brand-100 group-hover:text-brand-600">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-600">{prompt.label}</p>
        <p className="mt-0.5 text-xs font-semibold text-brand-700 group-hover:text-brand-800">
          {prompt.cta} →
        </p>
      </div>
    </Link>
  );
}
