import Link from "next/link";
import { Check } from "lucide-react";
import LandingHeroImagery from "@/components/fundraisers/LandingHeroImagery";

export interface LandingHeroCta {
  label: string;
  href: string;
}

export interface LandingHeroProps {
  /** Block A eyebrow pill. */
  eyebrow: string;
  headline: string;
  /** Optional emphasized second line, rendered in the brand accent color. */
  headlineAccent?: string;
  /** The hero's single call to action — there is intentionally no secondary CTA. */
  primaryCta: LandingHeroCta;
  /**
   * Block B — real campaign photos, already filtered to exclude stock/fallback
   * images. Rendered as a decorative arced fan: up to 5 on desktop, 3 on
   * tablet and mobile. The block collapses entirely when none are supplied.
   */
  images: string[];
  /** Block C benefit pill — an unconditional platform promise. */
  benefitBadge: string;
  /**
   * Block C stat headline — the live, formatted lead figure (e.g. total raised).
   * Always derived from real data by the caller, never hardcoded.
   */
  impactStatValue: string;
  /** Block C stat headline — the wording that follows {impactStatValue}. */
  impactStatCaption: string;
  /** Block C — short paragraph on how fundraising works on the platform. */
  impactDescription: string;
}

export default function LandingHero({
  eyebrow,
  headline,
  headlineAccent,
  primaryCta,
  images,
  benefitBadge,
  impactStatValue,
  impactStatCaption,
  impactDescription,
}: LandingHeroProps) {
  return (
    <section className="relative z-0 overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-16 lg:px-8 lg:pb-16 lg:pt-20">
        {/* ── Block A — text only ── */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-white">
            {eyebrow}
          </span>

          <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
            {headline}
            {headlineAccent && (
              <>
                {" "}
                <span className="text-emerald-600">{headlineAccent}</span>
              </>
            )}
          </h1>

          <div className="mt-8 flex justify-center">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-black text-white transition hover:bg-emerald-700 sm:text-base"
            >
              {primaryCta.label}
            </Link>
          </div>
        </div>

        {/* ── Block B — photo fan (collapses when no real photos exist) ── */}
        {images.length > 0 && (
          <div className="mt-12 sm:mt-14 lg:mt-16">
            <LandingHeroImagery images={images} />
          </div>
        )}

        {/* ── Block C — impact stat + how it works ── */}
        <div className="mx-auto mt-4 max-w-3xl text-center sm:mt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            {benefitBadge}
          </span>

          <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight text-zinc-950 sm:text-4xl">
            <span className="text-emerald-600">{impactStatValue}</span> {impactStatCaption}
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-base font-medium text-zinc-600">
            {impactDescription}
          </p>
        </div>
      </div>
    </section>
  );
}
