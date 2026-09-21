import Link from "next/link";
import { Zap, Plus, ArrowRight } from "lucide-react";
import { VERTICAL_CONFIG, type VerticalStat, type VerticalPrompt } from "@/lib/dashboard-activity";
import { Button } from "@/components/ui/button";

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
  const [primary, ...secondary] = ranked.length > 0 ? ranked : [{ key: "fundraisers" as const, count: 0, label: "Fundraiser", value: "", icon: VERTICAL_CONFIG.fundraisers.icon, iconBg: "", iconColor: "", href: "" }];
  const primaryConfig = VERTICAL_CONFIG[primary.key];

  return (
    <div className={`rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs ${className ?? ""}`}>
      <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
        <Zap className="h-4 w-4 text-brand-700" aria-hidden />
        <h3 className="text-sm font-bold text-zinc-950">Quick Actions</h3>
      </div>

      <div className="pt-4 space-y-3">
        {/* Dominant Quick Action */}
        <Link
          href={primaryConfig.createHref}
          className="group relative flex items-center justify-between overflow-hidden rounded-xl bg-primary p-4 text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <primaryConfig.icon className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate leading-tight">
                {primaryConfig.createAgainCta}
              </p>
              <p className="text-[11px] text-white/80 mt-0.5">
                Primary active module
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>

        {/* Secondary Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {Object.values(VERTICAL_CONFIG)
            .filter((v) => v.key !== primary.key)
            .slice(0, 4)
            .map((vertical) => {
              const Icon = vertical.icon;
              return (
                <Link
                  key={vertical.key}
                  href={vertical.createHref}
                  className="group flex flex-col items-start gap-1 rounded-lg border border-zinc-200/80 bg-white p-2.5 transition hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-1.5 text-zinc-600 group-hover:text-zinc-950">
                    <Icon className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                    <span className="text-xs font-semibold">{vertical.label}</span>
                  </div>
                  <span className="text-[11px] font-medium text-brand-700 group-hover:underline line-clamp-1">
                    + {vertical.createCta}
                  </span>
                </Link>
              );
            })}
        </div>
      </div>
    </div>
  );
}
