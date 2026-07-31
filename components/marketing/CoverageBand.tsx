import Link from "next/link";

export interface CoverageBandLink {
  label: string;
  href: string;
}

interface CoverageBandProps {
  /** Small badge above the headline. */
  pill: string;
  /** Headline rendered as stacked centered lines. */
  headlineLines: string[];
  /** Supporting paragraph — pass as children so callers can embed inline links. */
  children: React.ReactNode;
  /** Optional "Still have questions?" style link beneath the paragraph. */
  stillHaveQuestions?: CoverageBandLink;
  /** Band background. Defaults to the approved coral. */
  backgroundColor?: string;
  /**
   * Fill color of the decorative bottom wave — should match whatever section
   * sits directly below so the wave reads as this band's edge. Defaults to the
   * page background (`bg-zinc-50`).
   */
  waveColor?: string;
}

const CORAL = "#D85A30";
// Very dark / very light values of the coral hue — a dark badge derived from
// coral, not a second accent color.
const CORAL_CHIP_BG = "#3A1B10";
const CORAL_CHIP_TEXT = "#F6DDD1";
const PAGE_BG = "#fafafa"; // Tailwind zinc-50, the /fundraisers page background.

/**
 * Full-bleed "we've got you covered" reassurance band with a curved bottom
 * edge. Purely presentational and product-agnostic — copy and inline links are
 * supplied by the caller so it can be reused across product pages.
 */
export default function CoverageBand({
  pill,
  headlineLines,
  children,
  stillHaveQuestions,
  backgroundColor = CORAL,
  waveColor = PAGE_BG,
}: CoverageBandProps) {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor }}>
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-20 text-center sm:px-6 sm:pb-32 sm:pt-24 lg:px-8">
        <span
          className="inline-block rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest"
          style={{ backgroundColor: CORAL_CHIP_BG, color: CORAL_CHIP_TEXT }}
        >
          {pill}
        </span>

        <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
          {headlineLines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </h2>

        <div className="mx-auto mt-6 max-w-2xl text-base font-medium text-white/90 sm:text-lg [&_a]:font-bold [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-white">
          {children}
        </div>

        {stillHaveQuestions && (
          <p className="mt-6 text-sm font-semibold text-white/80">
            Still have questions?{" "}
            <Link
              href={stillHaveQuestions.href}
              className="font-black text-white underline underline-offset-2"
            >
              {stillHaveQuestions.label}
            </Link>
          </p>
        )}
      </div>

      {/* Decorative curved bottom edge — overlays the below-section color. */}
      <svg
        aria-hidden
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[60px] w-full sm:h-[80px]"
      >
        <path
          fill={waveColor}
          d="M0,64 C240,16 480,16 720,48 C960,80 1200,80 1440,40 L1440,100 L0,100 Z"
        />
      </svg>
    </section>
  );
}
