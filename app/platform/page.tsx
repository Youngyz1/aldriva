import Link from "next/link";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "One Platform for the Event Economy | Aldriva",
  description:
    "Focused workflows for attendees, organizers, and sponsors across events, fundraising, and sponsorships.",
  alternates: {
    canonical: `${getSiteUrl()}/platform`,
  },
};

const roles = [
  {
    title: "Attendees",
    description:
      "Find events, buy tickets, support causes, and keep every QR ticket in one place.",
    features: [
      "Buy tickets",
      "Donate to campaigns",
      "Follow organizations",
      "Save events",
      "Get email reminders",
      "Transfer tickets",
    ],
    accent: "orange",
  },
  {
    title: "Organizations",
    description:
      "Launch events and fundraisers with ticketing, campaign pages, and analytics built in.",
    features: [
      "Create events",
      "Sell tickets",
      "Run fundraisers",
      "View analytics",
      "Manage attendees",
      "Send updates",
    ],
    accent: "emerald",
  },
  {
    title: "Sponsors",
    description:
      "Discover campaigns and events worth backing, then manage sponsorship opportunities.",
    features: [
      "Browse campaigns",
      "Browse events",
      "Offer sponsorships",
      "Manage requests",
      "Track ROI",
    ],
    accent: "blue",
  },
];

const accents: Record<string, { badge: string; dot: string }> = {
  orange: {
    badge: "bg-orange-100 text-orange-700",
    dot: "bg-orange-500",
  },
  emerald: {
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  blue: {
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
};

export default function PlatformPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="bg-zinc-950 px-4 py-20 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-black uppercase tracking-wide text-orange-400">
            Platform
          </p>
          <h1 className="mt-3 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">
            One Platform for the Event Economy
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-300">
            Attendees, organizers, sponsors, and admins each get a focused workflow
            instead of a pile of disconnected tools.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6">
          {roles.map((role) => {
            const accent = accents[role.accent];

            return (
              <article
                key={role.title}
                className="grid gap-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-[0.8fr_1.2fr] md:p-8"
              >
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${accent.badge}`}>
                    {role.title}
                  </span>
                  <p className="mt-5 text-2xl font-black leading-tight text-zinc-950">
                    {role.description}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {role.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-700"
                    >
                      <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
                      {feature}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl bg-zinc-950 p-8 text-white md:flex md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-400">
              Ready to get started?
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">
              Explore events or start building your own.
            </h2>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 md:mt-0">
            <Link
              href="/events"
              className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-700"
            >
              Browse Events
            </Link>
            <Link
              href="/create-event"
              className="rounded-xl bg-white px-5 py-3 text-sm font-black text-zinc-950 transition hover:bg-zinc-100"
            >
              Create Event
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
