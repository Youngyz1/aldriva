// app/dashboard/loading.tsx — Overview skeleton
export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="h-3 w-20 rounded bg-zinc-200" />
        <div className="mt-2 h-8 w-40 rounded bg-zinc-200" />
        <div className="mt-2 h-3 w-52 rounded bg-zinc-200" />
      </div>
      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex min-h-32 flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5">
            <div className="flex justify-between">
              <div className="h-2.5 w-24 rounded bg-zinc-200" />
              <div className="h-8 w-8 rounded-full bg-zinc-200" />
            </div>
            <div>
              <div className="h-8 w-20 rounded bg-zinc-200" />
              <div className="mt-2 h-2.5 w-32 rounded bg-zinc-200" />
            </div>
          </div>
        ))}
      </div>
      {/* Two panels */}
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-200/80 bg-white p-5">
            <div className="h-4 w-36 rounded bg-zinc-200" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-16 rounded-xl bg-zinc-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
