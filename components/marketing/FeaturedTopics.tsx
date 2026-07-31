import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeaturedTopicTone = "emerald-solid" | "emerald-soft" | "neutral";

export interface FeaturedTopic {
  /** Small badge overlaid on the media. */
  tag: string;
  /** Badge/CTA styling — shades of existing tokens, not new colors. */
  tone: FeaturedTopicTone;
  /** Real, normalized image URL. When absent, a branded tile is shown instead
   *  of a fabricated stock photo. */
  image?: string | null;
  imageAlt?: string;
  /** Icon for the branded tile fallback (when no real image exists). */
  icon?: React.ReactNode;
  title: string;
  href: string;
  cta: string;
}

interface FeaturedTopicsProps {
  heading: string;
  topics: FeaturedTopic[];
}

const BADGE_CLASS: Record<FeaturedTopicTone, string> = {
  "emerald-solid": "bg-emerald-600 text-white",
  "emerald-soft": "bg-white/90 text-emerald-700 ring-1 ring-emerald-100 backdrop-blur",
  neutral: "bg-zinc-900/90 text-white backdrop-blur",
};

const TILE_CLASS: Record<FeaturedTopicTone, string> = {
  "emerald-solid": "bg-gradient-to-br from-emerald-500 to-emerald-700",
  "emerald-soft": "bg-gradient-to-br from-emerald-500 to-emerald-700",
  neutral: "bg-gradient-to-br from-zinc-700 to-zinc-900",
};

const CTA_CLASS: Record<FeaturedTopicTone, string> = {
  "emerald-solid": "text-emerald-700",
  "emerald-soft": "text-emerald-700",
  neutral: "text-zinc-800",
};

/**
 * Generic "featured topics" row — three linked cards, each a badge + media +
 * title + CTA. Product-agnostic: cards (including their real destinations and
 * imagery) are supplied by the caller. Cards without a real image fall back to
 * a branded token tile rather than stock photography.
 */
export default function FeaturedTopics({ heading, topics }: FeaturedTopicsProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">{heading}</h2>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <Link key={topic.href + topic.title} href={topic.href} className="group block">
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="relative h-44 w-full sm:h-48">
                {topic.image ? (
                  <Image
                    src={topic.image}
                    alt={topic.imageAlt ?? topic.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-full w-full items-center justify-center text-white/70",
                      TILE_CLASS[topic.tone]
                    )}
                  >
                    {topic.icon}
                  </div>
                )}
                <span
                  className={cn(
                    "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
                    BADGE_CLASS[topic.tone]
                  )}
                >
                  {topic.tag}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <h3 className="line-clamp-2 text-base font-black leading-snug text-zinc-950 sm:text-lg">
                  {topic.title}
                </h3>
                <span
                  className={cn(
                    "mt-auto inline-flex items-center gap-1 pt-4 text-sm font-black",
                    CTA_CLASS[topic.tone]
                  )}
                >
                  {topic.cta}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
