import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VERTICAL_CONFIG, type VerticalPrompt } from "@/lib/dashboard-activity";

export default function GetStartedPromptCard({ prompt }: { prompt: VerticalPrompt }) {
  const Icon = VERTICAL_CONFIG[prompt.key].icon;

  return (
    <Link
      href={prompt.href}
      className="group flex flex-col justify-between rounded-lg border border-zinc-200/80 bg-white p-3.5 transition hover:border-zinc-300 hover:shadow-xs"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/60 bg-zinc-50 text-zinc-600 group-hover:text-brand-700 transition">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </div>
        <p className="text-xs font-bold text-zinc-900">{prompt.label}</p>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-brand-700 group-hover:underline">
        <span>{prompt.cta}</span>
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
