/**
 * Shared route-level loading UI.
 *
 * Its real job is structural, not decorative. Without a `loading.tsx` a route
 * has no Suspense boundary, so on a client navigation the router keeps the
 * PREVIOUS page mounted — at its previous scroll offset — until the new
 * page's data resolves, then commits everything at once. The scroll reset
 * runs after that paint, which is the flash of landing near the footer before
 * jumping to the top.
 *
 * With a boundary, this shell paints immediately at scroll position 0 and the
 * real content streams in behind it.
 *
 * `min-h-screen` matters: a short placeholder lets the document stay short
 * enough that the browser can restore a deep scroll offset, which reintroduces
 * the same jump. Full height makes the top of the page the only valid
 * position.
 */
export default function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-brand-600"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm font-semibold text-zinc-400">Loading…</p>
      </div>
    </div>
  );
}
