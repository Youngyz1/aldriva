// app/dashboard/donations/loading.tsx — Donations skeleton
export default function DonationsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6 space-y-2">
        <div className="h-2.5 w-16 rounded bg-zinc-200" />
        <div className="h-7 w-28 rounded bg-zinc-200" />
        <div className="h-2.5 w-64 rounded bg-zinc-200" />
      </div>
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm space-y-3">
            <div className="h-2.5 w-24 rounded bg-zinc-200" />
            <div className="h-8 w-28 rounded bg-zinc-200" />
            <div className="h-2.5 w-20 rounded bg-zinc-200" />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex gap-4 border-b border-zinc-100 pb-3">
          {[100, 120, 120, 70, 80, 80].map((w, i) => (
            <div key={i} className="h-2.5 rounded bg-zinc-200" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-zinc-50 py-3 last:border-0">
            {[100, 120, 120, 70, 80, 80].map((w, j) => (
              <div key={j} className="h-3 rounded bg-zinc-100" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
