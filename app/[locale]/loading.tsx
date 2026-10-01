export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-orange-500"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm font-semibold text-zinc-400">Loading…</p>
      </div>
    </div>
  );
}
