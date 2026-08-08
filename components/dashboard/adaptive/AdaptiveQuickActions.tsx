import Link from "next/link";
import { Zap } from "lucide-react";
import { VERTICAL_CONFIG, type VerticalStat, type VerticalPrompt } from "@/lib/dashboard-activity";

/**
 * Primary tile = the user's most active vertical (by raw item count).
 * Secondary tiles = create-again actions for their other active verticals,
 * same bordered/slate-50 treatment as event-platform's QuickActions.
 * Untouched verticals get a de-emphasized text-link row at the bottom,
 * not full cards — the KPI section's GetStartedPromptCard already covers
 * that ground with more visual weight; this is just a lower-priority nudge.
 */
export default function AdaptiveQuickActions({
  activeVerticals,
  untouchedVerticals,
  className,
}: {
  activeVerticals: VerticalStat[];
  untouchedVerticals: VerticalPrompt[];
  className?: string;
}) {
  const ranked = [...activeVerticals].sort((a, b) => b.count - a.count);
  const [primary, ...secondary] = ranked;
  const primaryConfig = VERTICAL_CONFIG[primary.key];

  return (
    <div className={`rounded-xl border border-zinc-200 bg-white ${className ?? ""}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Zap className="h-4 w-4 text-slate-400" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
      </div>

      <div className="p-4">
        <Link
          href={primaryConfig.createHref}
          className="group flex min-h-[76px] items-center gap-4 rounded-xl bg-brand-700 px-5 py-4 text-left shadow-sm transition-all duration-150 hover:bg-brand-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <primaryConfig.icon className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{primaryConfig.createAgainCta}</p>
            <p className="text-xs text-brand-100">Your most active vertical</p>
          </div>
        </Link>

        {secondary.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {secondary.map((vertical) => {
              const config = VERTICAL_CONFIG[vertical.key];
              return (
                <Link
                  key={vertical.key}
                  href={config.createHref}
                  className="group flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-all duration-150 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white transition-colors group-hover:border-brand-200 group-hover:bg-brand-100">
                    <config.icon className="h-3.5 w-3.5 text-brand-700" aria-hidden />
                  </div>
                  <p className="text-xs font-semibold leading-none text-slate-900">
                    {config.createAgainCta}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        {untouchedVerticals.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Also try
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {untouchedVerticals.map((prompt) => (
                <Link
                  key={prompt.key}
                  href={prompt.href}
                  className="text-xs font-medium text-slate-500 hover:text-brand-700 hover:underline"
                >
                  {prompt.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
