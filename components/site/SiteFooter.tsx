/**
 * components/site/SiteFooter.tsx
 *
 * Tenant-branded site footer driven by footer_config (Phase 1).
 */

import { sanitizeUrl } from "@/lib/sanitize-url";
import type { FooterConfig } from "@/lib/website-nav";

interface SiteFooterProps {
  siteTitle: string;
  footerConfig: FooterConfig;
  primaryColor: string;
}

export function SiteFooter({ siteTitle, footerConfig, primaryColor }: SiteFooterProps) {
  const year = new Date().getFullYear();
  const copyright = footerConfig.copyrightText
    ? footerConfig.copyrightText
    : `© ${year} ${siteTitle}. All rights reserved.`;

  return (
    <footer className="w-full border-t border-[var(--ps-border)] bg-[var(--ps-surface)]">
      <div className="mx-auto max-w-6xl px-[var(--ps-space-4)] py-[var(--ps-space-12)] md:px-[var(--ps-space-6)]">
        <div className="flex flex-col items-center gap-[var(--ps-space-4)] text-center sm:flex-row sm:justify-between sm:text-left">
          {/* Copyright */}
          <p className="text-sm text-[var(--ps-muted)]">{copyright}</p>

          {/* Custom links */}
          {footerConfig.customLinks && footerConfig.customLinks.length > 0 && (
            <nav className="flex flex-wrap justify-center gap-x-[var(--ps-space-6)] gap-y-[var(--ps-space-2)] sm:justify-end">
              {footerConfig.customLinks.map((link, i) => {
                const safeLinkHref = sanitizeUrl(link.href);
                if (!safeLinkHref) return null;
                return (
                  <a
                    key={i}
                    href={safeLinkHref}
                    className="text-sm text-[var(--ps-muted)] hover:text-[var(--ps-text)] transition"
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          )}
        </div>


        {/* Powered by Aldriva */}
        {footerConfig.showPoweredBy && (
          <div className="mt-[var(--ps-space-6)] text-center">
            <a
              href="https://aldriva.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--ps-muted)] hover:text-[var(--ps-muted)] transition"
              style={{ "--hover-color": primaryColor } as React.CSSProperties}
            >
              Powered by Aldriva
            </a>
          </div>
        )}
      </div>
    </footer>
  );
}
