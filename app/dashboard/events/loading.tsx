// app/dashboard/events/loading.tsx — Events table skeleton
export default function EventsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="space-y-2">
          <div className="h-2.5 w-16 rounded bg-zinc-200" />
          <div className="h-7 w-24 rounded bg-zinc-200" />
          <div className="h-2.5 w-56 rounded bg-zinc-200" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-zinc-200" />
      </div>
      {/* Table */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        {/* Thead placeholder */}
        <div className="mb-4 flex gap-4 border-b border-zinc-100 pb-3">
          {[140, 80, 80, 80, 60, 80, 80].map((w, i) => (
            <div key={i} className="h-2.5 rounded bg-zinc-200" style={{ width: w }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-zinc-50 py-3 last:border-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-zinc-200" />
            <div className="h-3 w-36 rounded bg-zinc-200" />
            <div className="ml-auto flex gap-8">
              {[60, 80, 80, 40, 70, 80].map((w, j) => (
                <div key={j} className="h-3 rounded bg-zinc-100" style={{ width: w }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
