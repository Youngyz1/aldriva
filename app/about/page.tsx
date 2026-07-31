import type { Metadata } from "next";
import Link from "next/link";


export const metadata: Metadata = {
  metadataBase: new URL("https://www.fund4agoodcause.com"),
  title: "About — Aldriva",
  description: "Learn about Aldriva's mission to connect communities through events and fundraising.",
  alternates: {
    canonical: "https://www.fund4agoodcause.com/about",
  },
  openGraph: {
    title: "About — Aldriva",
    description: "Learn about Aldriva's mission to connect communities through events and fundraising.",
    url: "https://www.fund4agoodcause.com/about",
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "About Aldriva" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

const platformStats = [
  { value: "Events", label: "Publish local experiences, sell tickets, and manage attendance." },
  { value: "Causes", label: "Launch fundraisers with clear stories, goals, and donor updates." },
  { value: "Organizations", label: "Build editable profiles with photos, followers, and details." },
];

const pathways = [
  {
    title: "Host",
    description:
      "Create events, import listings from trusted sources, connect them to the right organizer, and keep every post editable after it goes live.",
    href: "/create-event",
    label: "Create an event",
  },
  {
    title: "Discover",
    description:
      "Find concerts, business meetups, dating events, community programs, and fundraisers happening around New Jersey and nearby cities.",
    href: "/events",
    label: "Browse events",
  },
  {
    title: "Support",
    description:
      "Give to fundraisers that explain the need, show progress, share success stories, and make supporters feel confident.",
    href: "/fundraisers",
    label: "View fundraisers",
  },
];

const trustPoints = [
  "Organization profiles can be updated with photos, bios, follower counts, and contact details.",
  "Imported events remain editable, so listings can be cleaned up after they are pulled in.",
  "Campaign pages include story, impact, progress, and supporter-focused calls to action.",
  "Source links help visitors understand where imported events or campaigns came from.",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
       

      <section className="relative isolate overflow-hidden bg-zinc-950 text-white">
        <img
          src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=1800&auto=format&fit=crop"
          alt="People gathered at a live community event"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
        <div className="mx-auto grid min-h-[560px] max-w-7xl content-end px-4 pb-16 pt-24 sm:px-6 lg:pb-24">
          <p className="mb-4 w-fit rounded-full bg-orange-600 px-4 py-2 text-sm font-black uppercase tracking-wide">
            About Aldriva
          </p>
          <h1 className="max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-7xl">
            Bringing local communities together through events, causes, and trusted organizers.
          </h1>
          <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-zinc-100 sm:text-xl">
            Aldriva helps people create, discover, book, and support real experiences. From ticketed events to fundraisers, the goal is simple: make it easier for communities to show up.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/events" className="rounded-full bg-orange-600 px-6 py-3 font-black text-white transition hover:bg-orange-700">
              Find an experience
            </Link>
            <Link href="/create-event" className="rounded-full bg-white px-6 py-3 font-black text-zinc-950 transition hover:bg-zinc-100">
              Start hosting
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white px-4 py-14 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">Our mission</p>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
              Help organizers grow while helping people find where they belong.
            </h2>
          </div>
          <div className="space-y-5 text-lg leading-8 text-zinc-700">
            <p>
              We are building a home for live events, community programs, and fundraising campaigns that need more than a simple listing. A strong page should show who is behind it, why it matters, what supporters can expect, and how people can take action.
            </p>
            <p>
              That means organizers can publish from scratch, import from places like Eventbrite or GoFundMe, then edit the final page so it feels complete on their own website.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-zinc-50 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-3">
            {platformStats.map((item) => (
              <div key={item.value} className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-3xl font-black text-orange-600">{item.value}</h3>
                <p className="mt-4 text-base font-semibold leading-7 text-zinc-700">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">What you can do</p>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
              One platform for the full community flow.
            </h2>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {pathways.map((item) => (
              <article key={item.title} className="rounded-lg border border-zinc-200 bg-white p-7 shadow-sm">
                <h3 className="text-2xl font-black">{item.title}</h3>
                <p className="mt-4 min-h-32 text-base leading-7 text-zinc-700">{item.description}</p>
                <Link href={item.href} className="mt-6 inline-flex rounded-full bg-zinc-950 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-600">
                  {item.label}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#1f0a3d] px-4 py-14 text-white sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-300">Built for trust</p>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
              Imported does not have to mean unfinished.
            </h2>
            <p className="mt-5 text-lg leading-8 text-violet-100">
              Every imported organizer, event, or campaign should still feel owned by your website. The page can be improved with real details, stronger images, better descriptions, and the right local organizer name.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {trustPoints.map((point) => (
              <div key={point} className="rounded-lg bg-white/10 p-5 ring-1 ring-white/15">
                <p className="text-base font-semibold leading-7 text-violet-50">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-lg border border-zinc-200 bg-zinc-50 p-8 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">Ready to build</p>
            <h2 className="mt-3 text-3xl font-black">Create a page people can trust.</h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-700">
              Start with an event, fundraiser, or organizer profile, then shape the details until it feels complete.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/create-event" className="rounded-full bg-orange-600 px-6 py-3 font-black text-white transition hover:bg-orange-700">
              Create event
            </Link>
            <Link href="/create-fundraiser" className="rounded-full bg-zinc-950 px-6 py-3 font-black text-white transition hover:bg-zinc-800">
              Start fundraiser
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
