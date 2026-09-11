import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { BRAND } from "@/config/branding";

// Compact footer for individual content/product pages (event, fundraiser,
// article, organization, business, product details). Essential
// navigation/legal links only — never the large marketing footer.
const exploreLinks = [
  ["Events", "/events"],
  ["Fundraisers", "/fundraisers"],
  ["Organizations", "/organizers"],
  ["Articles", "/articles"],
] as const;

const supportLinks = [
  ["Help", "/platform"],
  ["Contact", "/about"],
  ["Find Tickets", "/find-tickets"],
] as const;

// Legal links — only link to routes that exist. Do not invent routes here.
const legalLinks = [
  ["Terms", "/terms"],
  ["Privacy", "/privacy"],
  ["Cookies", "/cookies"],
] as const;

function FooterLinkGroup({
  label,
  links,
}: {
  label: string;
  links: readonly (readonly [string, string])[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      {links.map(([text, href]) => (
        <Link
          key={href + text}
          href={href}
          className="rounded text-sm font-semibold text-zinc-600 transition-colors hover:text-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-zinc-400"
        >
          {text}
        </Link>
      ))}
    </nav>
  );
}

export function CompactFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white text-zinc-950 dark:border-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <BrandMark textClassName="text-zinc-950 dark:text-white" />
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <FooterLinkGroup label="Explore" links={exploreLinks} />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <FooterLinkGroup label="Support" links={supportLinks} />
            <FooterLinkGroup label="Legal" links={legalLinks} />
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-100 dark:border-zinc-800">
        <p className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-zinc-500 sm:px-6 md:text-left lg:px-8">
          © 2026 {BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/**
 * Layout shell for individual content/product segments.
 * Same sticky-bottom contract as MarketingSection but with the compact
 * footer. Use in `layout.tsx` files of detail segments.
 */
export function CompactSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <CompactFooter />
    </div>
  );
}
