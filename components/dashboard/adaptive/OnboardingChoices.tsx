import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { VERTICAL_CONFIG, type VerticalKey } from "@/lib/dashboard-activity";
import { Button } from "@/components/ui/button";

const DESCRIPTIONS: Record<VerticalKey, { tagline: string; description: string }> = {
  fundraisers: {
    tagline: "Community & Nonprofit Campaigns",
    description: "Launch a crowdfunding campaign with direct donation receipts and transparent ledgers.",
  },
  events: {
    tagline: "Events & Seating Operations",
    description: "Host gatherings with interactive SVG venue seat maps, offline door QR scanning, and custom tickets.",
  },
  products: {
    tagline: "Digital Products & Shop",
    description: "Sell downloadable digital assets, files, or physical goods with dual card and crypto rails.",
  },
  articles: {
    tagline: "Editorial Publishing & Audio",
    description: "Publish stories and guides using the TipTap editor with automated AI narration synthesis.",
  },
  businesses: {
    tagline: "Local Business Directory",
    description: "Create a verified business listing, connect customer channels, and launch your tenant website.",
  },
};

export default function OnboardingChoices({ displayName }: { displayName: string }) {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl border-b border-zinc-200/80 pb-6">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Getting Started
        </span>
        <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
          Welcome to Aldriva, {displayName}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
          Aldriva gives you the complete toolkit to build, sell, publish, and fundraise in one place. Choose an area below to launch your first initiative.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(VERTICAL_CONFIG).map((vertical) => {
          const Icon = vertical.icon;
          const info = DESCRIPTIONS[vertical.key];

          return (
            <div
              key={vertical.key}
              className="group flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-xs"
            >
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-50 text-zinc-800 group-hover:bg-brand-50 group-hover:border-brand-200 group-hover:text-brand-700 transition">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-950">{vertical.label}</h3>
                <p className="text-xs font-semibold text-zinc-500 mt-0.5">{info.tagline}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600">{info.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-100">
                <Button asChild size="sm" variant="outline" className="w-full justify-between h-9 text-xs font-bold">
                  <Link href={vertical.createHref}>
                    <span>{vertical.createCta}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
