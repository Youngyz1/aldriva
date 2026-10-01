// Mirrors the real page's single-column, hero-first shell so the skeleton
// occupies roughly the same layout as the content that replaces it. Its main
// job isn't visual polish — it's giving the router something to commit to
// almost instantly, so Next's scroll-to-top correction (which runs once per
// navigation, right after the first commit) fires against a short, top-of-
// page skeleton instead of blocking on the full dynamic fundraiser query and
// only correcting after a long, visible delay.

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 ${className}`} />;
}

export default function FundraiserLoading() {
  return (
    <main className="min-h-screen bg-white pb-40 text-zinc-950">
      {/* Hero — full-bleed on mobile, matches the real page's -mx-4 sm:mx-0
          breakout. Title now overlays the hero itself (see
          FundraiserMediaSlider), so its placeholder lives here too, pinned
          to the bottom of the image like the real gradient-scrim overlay. */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="-mx-4 sm:mx-0">
          <div className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[16/9] sm:rounded-2xl">
            <Block className="absolute inset-0 rounded-none" />
            <div className="absolute inset-x-0 bottom-0 space-y-2 px-4 pb-12 pt-16 sm:px-6 sm:pb-14">
              <Block className="h-5 w-24 rounded-full bg-white/20" />
              <Block className="h-8 w-3/4 bg-white/30" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        {/* Raised / progress / goal + Donate/Share — immediately below hero */}
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Block className="h-[72px] w-[72px] rounded-full" />
            <div className="flex-1 space-y-2">
              <Block className="h-6 w-3/4" />
              <Block className="h-4 w-1/2" />
            </div>
          </div>
          <div className="flex gap-2.5">
            <Block className="h-12 w-full rounded-full" />
            <Block className="h-12 w-full rounded-full" />
          </div>
        </div>

        <div className="space-y-2">
          <Block className="h-4 w-full" />
          <Block className="h-4 w-full" />
          <Block className="h-4 w-2/3" />
        </div>
      </div>
    </main>
  );
}
