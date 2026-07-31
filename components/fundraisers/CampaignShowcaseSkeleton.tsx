function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-100 overflow-hidden ${wide ? "sm:col-span-2" : ""}`}
    >
      <div className="aspect-video w-full animate-pulse bg-zinc-100" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
        <div className="h-2 w-full animate-pulse rounded bg-zinc-100" />
        <div className="flex justify-between">
          <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

export default function CampaignShowcaseSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 flex-shrink-0 animate-pulse rounded-full bg-zinc-100" />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard wide />
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
