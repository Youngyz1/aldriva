import Link from "next/link";
import {
  IconBuilding as Building2,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceItem } from "@/lib/dashboard/account-blocks-registry";

interface WorkspacesBlockProps {
  workspaces: WorkspaceItem[];
}

export function WorkspacesBlock({ workspaces }: WorkspacesBlockProps) {
  if (workspaces.length === 0) return null;

  const showAllWorkspacesLink = workspaces.length > 4;
  const displayedWorkspaces = workspaces.slice(0, 4);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-950">Workspaces</h2>
            <p className="text-xs text-zinc-500">Organizations and businesses you run</p>
          </div>
        </div>

        {showAllWorkspacesLink && (
          <Link
            href="/dashboard/organizations"
            className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline transition"
          >
            <span>All workspaces ({workspaces.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {displayedWorkspaces.map((ws) => (
          <div
            key={ws.id}
            className="flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-white p-4 sm:p-5 transition hover:border-zinc-300 hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                  {ws.typeChip}
                </span>
                <span className="text-xs font-bold text-zinc-600">
                  {ws.statLabel}
                </span>
              </div>
              <h3 className="mt-2.5 line-clamp-1 text-sm font-black text-zinc-900" title={ws.name}>
                {ws.name}
              </h3>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full min-h-[44px] rounded-xl text-xs font-bold hover:border-orange-200 hover:text-orange-700 transition"
              >
                <Link href={ws.href}>Open</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
