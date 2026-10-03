/**
 * app/admin/workforce/_components/stage-stub.tsx — Stage 1.
 * Placeholder shell for Workforce sections whose stage has not been built
 * yet. Renders an honest "not built" state — never fake content. Private
 * (_-prefixed) directory: shared component, not a route.
 */
import Link from "next/link";
import { Construction } from "lucide-react";

export default function StageStub({ title, stage, blurb }: { title: string; stage: string; blurb: string }) {
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-2xl text-white">{title}</h1>
        <p className="text-sm text-zinc-400">{blurb}</p>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-zinc-900 p-6 shadow-xs">
        <Construction size={22} className="text-amber-400" />
        <div>
          <p className="text-sm text-white">Coming in {stage}.</p>
          <p className="text-sm text-zinc-500">
            This section will read live Agent Runtime data. Until then it stays empty by design.
          </p>
        </div>
      </div>
      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
