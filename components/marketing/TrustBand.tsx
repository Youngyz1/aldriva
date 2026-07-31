export interface TrustBandProps {
  /** Small badge above the headline. */
  pill: string;
  /** Headline rendered as stacked lines in the left column. */
  headlineLines: string[];
  /** Supporting paragraph — pass as children so callers can embed inline links. */
  children: React.ReactNode;
  /** Right-column visual (a real image or a branded fallback tile). */
  media: React.ReactNode;
  /** Band background. Defaults to the approved teal. */
  backgroundColor?: string;
}

const TEAL = "#04342C";
// Darker / lighter values of the teal hue — a dark badge derived from teal,
// mirroring the WhyAldriva chip treatment (not a new accent color).
const TEAL_CHIP_BG = "#022019";
const TEAL_CHIP_TEXT = "#CFEAE1";

/**
 * Full-bleed two-column trust band (text left, visual right). Purely
 * presentational and product-agnostic — copy, inline links, and the media
 * visual are supplied by the caller so it can be reused across product pages.
 */
export default function TrustBand({
  pill,
  headlineLines,
  children,
  media,
  backgroundColor = TEAL,
}: TrustBandProps) {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor }}>
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Text column */}
          <div>
            <span
              className="inline-block rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest"
              style={{ backgroundColor: TEAL_CHIP_BG, color: TEAL_CHIP_TEXT }}
            >
              {pill}
            </span>

            <h2 className="mt-6 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
              {headlineLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h2>

            <div className="mt-6 max-w-xl text-base font-medium text-white/90 sm:text-lg [&_a]:font-bold [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-white">
              {children}
            </div>
          </div>

          {/* Media column */}
          <div>{media}</div>
        </div>
      </div>
    </section>
  );
}
