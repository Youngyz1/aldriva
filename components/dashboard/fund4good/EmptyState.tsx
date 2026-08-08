import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

/** Shared "nothing here yet" block used by every list/chart/timeline card on the dashboard. */
export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-5 py-10 text-center", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
        <Icon className="h-5 w-5 text-slate-300" aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {description && <p className="max-w-xs text-xs text-slate-400">{description}</p>}
    </div>
  );
}
