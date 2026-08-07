import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-100", className)}
      aria-hidden
    />
  );
}

export function CampaignSummarySkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white p-6 space-y-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonationListSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-50">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-1 text-right">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeedSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      <div className="border-b border-zinc-200 px-5 py-4">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="px-5 py-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pt-1">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
