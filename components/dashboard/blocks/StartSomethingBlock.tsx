import Link from "next/link";
import {
  IconPlus as Plus,
  IconCalendar as Calendar,
  IconHeart as Heart,
  IconBuilding as Building2,
  IconBuildingStore as Store,
  IconNews as Newspaper,
  IconShoppingBag as ShoppingBag,
  IconSparkles as Sparkles,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import type { StartSuggestion } from "@/lib/dashboard/account-blocks-registry";

const ICON_MAP = {
  Calendar,
  Heart,
  Building2,
  Store,
  Newspaper,
  ShoppingBag,
};

interface StartSomethingBlockProps {
  suggestions: StartSuggestion[];
}

export function StartSomethingBlock({ suggestions }: StartSomethingBlockProps) {
  if (suggestions.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
          <Sparkles className="h-4 w-4 text-orange-600" />
        </div>
        <div>
          <h2 className="text-base font-black text-zinc-950">Start something new</h2>
          <p className="text-xs text-zinc-500">Explore new capabilities available in your account</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((item) => {
          const Icon = ICON_MAP[item.iconName as keyof typeof ICON_MAP] ?? Plus;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="group flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 transition hover:border-orange-300 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 transition group-hover:bg-orange-100">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-zinc-900 group-hover:text-orange-700 transition">
                    {item.label}
                  </h3>
                  <p className="truncate text-xs text-zinc-500">{item.description}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-orange-600 transition" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
