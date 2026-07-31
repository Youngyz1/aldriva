export default function FundraisersLoading() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero skeleton */}
      <div className="h-40 w-full animate-pulse bg-zinc-100" />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Card grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-100 overflow-hidden">
              <div className="aspect-video w-full animate-pulse bg-zinc-100" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-2 w-full animate-pulse rounded bg-zinc-100" />
                <div className="flex justify-between">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
