/**
 * components/site/SiteHeader.tsx
 *
 * Tenant-branded site header rendered by the public website engine.
 * Configuration is driven entirely by header_config (Phase 1) and filtered
 * navigation items (published pages only — staleness guard applied upstream).
 *
 * This is a Server Component — no client state, no hydration required for
 * the basic nav. Submenus (Phase 3+) can be progressively enhanced.
 */

import Link from "next/link";
import { sanitizeUrl } from "@/lib/sanitize-url";
import type { HeaderConfig } from "@/lib/website-nav";
import type { NavigationItem } from "@/lib/website-nav";

interface SiteHeaderProps {
  siteTitle: string;
  siteSlug: string;
  headerConfig: HeaderConfig;
  navItems: NavigationItem[];
  primaryColor: string;
}

export function SiteHeader({
  siteTitle,
  siteSlug,
  headerConfig,
  navItems,
  primaryColor,
}: SiteHeaderProps) {
  const baseUrl = `/site/${siteSlug}`;
  const safeCtaHref = headerConfig.ctaHref ? sanitizeUrl(headerConfig.ctaHref) : "";

  const headerClass = headerConfig.sticky
    ? "sticky top-0 z-50"
    : "relative z-10";

  return (
    <header
      className={`${headerClass} w-full border-b border-[var(--ps-border)]/80 bg-[var(--ps-surface)]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--ps-surface)]/80`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-[var(--ps-space-4)] px-[var(--ps-space-4)] md:px-[var(--ps-space-6)]">
        {/* Logo / site title */}
        {headerConfig.showLogo && (
          <Link
            href={baseUrl}
            className="shrink-0 text-lg font-bold text-[var(--ps-text)] hover:text-[var(--ps-muted)]"
            style={{ color: primaryColor }}
          >
            {siteTitle}
          </Link>
        )}

        {/* Desktop navigation */}
        {headerConfig.showNav && navItems.length > 0 && (
          <nav className="hidden items-center gap-[var(--ps-space-1)] lg:flex" aria-label="Site navigation">
            {navItems.map((item) => {
              const safeHref = sanitizeUrl(item.href, baseUrl);
              return (
                <div key={item.id} className="relative group">
                  <Link
                    href={safeHref}
                    target={item.target ?? "_self"}
                    rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                    className="rounded-lg px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-sm font-medium text-[var(--ps-muted)] transition hover:bg-[var(--ps-neutral)] hover:text-[var(--ps-text)]"
                  >
                    {item.label}
                  </Link>
                  {/* Dropdown for children (rendered as a simple list; Phase 3 adds animation) */}
                  {item.children && item.children.length > 0 && (
                    <div className="absolute left-0 top-full hidden min-w-[160px] flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] py-[var(--ps-space-1)] shadow-md group-hover:flex">
                      {item.children.map((child) => {
                        const safeChildHref = sanitizeUrl(child.href, baseUrl);
                        return (
                          <Link
                            key={child.id}
                            href={safeChildHref}
                            target={child.target ?? "_self"}
                            rel={child.target === "_blank" ? "noopener noreferrer" : undefined}
                            className="px-[var(--ps-space-4)] py-[var(--ps-space-2)] text-sm text-[var(--ps-muted)] hover:bg-[var(--ps-neutral)]"
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* CTA button */}
        {headerConfig.showCta && headerConfig.ctaLabel && safeCtaHref && (
          <a
            href={safeCtaHref}
            className="ps-button shrink-0 text-sm font-semibold text-white shadow-xs transition hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            {headerConfig.ctaLabel}
          </a>
        )}
      </div>
    </header>
  );
}

