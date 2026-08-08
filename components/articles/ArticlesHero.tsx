import Link from "next/link";
import ArticlesSearchBar from "@/components/articles/ArticlesSearchBar";

const POPULAR_TAGS = [
  "Technology",
  "Business",
  "Events",
  "Fundraising",
  "Marketing",
  "AI",
  "Education",
  "Community",
];

/**
 * Abstract "floating glass cards" composition — there's no illustration
 * asset/library in this codebase, so the hero visual is built purely from
 * CSS gradient blobs + translucent card mockups rather than depending on a
 * stock image URL that can't be verified against next/image's remotePatterns.
 */
function HeroArtwork() {
  return (
    <div aria-hidden="true" className="relative hidden h-[420px] w-full lg:block">
      <div className="absolute left-6 top-4 h-56 w-56 rounded-full bg-orange-500/30 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="absolute right-16 top-10 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />

      {/* Floating glass cards */}
      <div className="absolute left-4 top-16 w-56 -rotate-6 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
        <span className="inline-block rounded-full bg-orange-500/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          Technology
        </span>
        <div className="mt-3 h-2.5 w-4/5 rounded-full bg-white/40" />
        <div className="mt-2 h-2.5 w-3/5 rounded-full bg-white/25" />
        <div className="mt-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-white/30" />
          <div className="h-2 w-16 rounded-full bg-white/25" />
        </div>
      </div>

      <div className="absolute right-6 top-2 w-52 rotate-3 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
        <span className="inline-block rounded-full bg-violet-500/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          Fundraising
        </span>
        <div className="mt-3 h-2.5 w-full rounded-full bg-white/40" />
        <div className="mt-2 h-2.5 w-2/3 rounded-full bg-white/25" />
      </div>

      <div className="absolute bottom-10 left-16 w-60 rotate-2 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
        <span className="inline-block rounded-full bg-cyan-500/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          Community
        </span>
        <div className="mt-3 h-2.5 w-4/5 rounded-full bg-white/40" />
        <div className="mt-2 h-2.5 w-1/2 rounded-full bg-white/25" />
        <div className="mt-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-white/30" />
          <div className="h-2 w-20 rounded-full bg-white/25" />
        </div>
      </div>

      <div className="absolute bottom-0 right-10 w-44 -rotate-3 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
        <div className="h-2.5 w-full rounded-full bg-white/35" />
        <div className="mt-2 h-2.5 w-2/3 rounded-full bg-white/20" />
      </div>
    </div>
  );
}

export default function ArticlesHero() {
  return (
    <section className="relative overflow-hidden bg-zinc-950">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, rgba(249,115,22,0.25), transparent 45%), radial-gradient(circle at 85% 75%, rgba(139,92,246,0.22), transparent 45%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-8 lg:py-28 lg:px-8">
        <div>
          <span className="inline-block rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-orange-300 backdrop-blur">
            Aldriva Stories
          </span>

          <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Discover Stories That Inspire Change
          </h1>

          <p className="mt-5 max-w-xl text-base font-medium leading-7 text-zinc-300 sm:text-lg">
            Explore insights, success stories, business ideas, fundraising journeys,
            technology, innovation and community impact from creators around the world.
          </p>

          <div className="mt-8 max-w-xl">
            <ArticlesSearchBar />
          </div>

          <div className="mt-6">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">Popular</span>
            <div className="scrollbar-hide -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {POPULAR_TAGS.map((tag) => (
                <Link
                  key={tag}
                  href={`/articles?category=${encodeURIComponent(tag)}#latest-articles`}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <HeroArtwork />
      </div>
    </section>
  );
}
