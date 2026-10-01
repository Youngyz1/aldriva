export default function EventsLoading() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero skeleton */}
      <div className="h-48 w-full animate-pulse bg-zinc-100" />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Filter bar skeleton */}
        <div className="mb-8 flex gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-24 animate-pulse rounded-full bg-zinc-100"
            />
          ))}
        </div>

        {/* Card grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-100 overflow-hidden">
              <div className="aspect-video w-full animate-pulse bg-zinc-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
