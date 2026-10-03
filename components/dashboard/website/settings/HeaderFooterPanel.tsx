"use client";

import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/layout/FormSection";
import type { HeaderConfig, FooterConfig } from "@/lib/website-nav";

export function HeaderFooterPanel({
  siteTitle,
  headerConfig,
  setHeaderConfig,
  footerConfig,
  setFooterConfig,
}: {
  siteTitle: string;
  headerConfig: HeaderConfig;
  setHeaderConfig: (v: HeaderConfig | ((p: HeaderConfig) => HeaderConfig)) => void;
  footerConfig: FooterConfig;
  setFooterConfig: (v: FooterConfig | ((p: FooterConfig) => FooterConfig)) => void;
}) {
  return (
    <div className="space-y-6">
      <FormSection title="Header Configuration">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={headerConfig.showLogo} onChange={(e) => setHeaderConfig((p: HeaderConfig) => ({ ...p, showLogo: e.target.checked }))} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Show Logo
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={headerConfig.showNav} onChange={(e) => setHeaderConfig((p: HeaderConfig) => ({ ...p, showNav: e.target.checked }))} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Show Navigation
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={headerConfig.sticky} onChange={(e) => setHeaderConfig((p: HeaderConfig) => ({ ...p, sticky: e.target.checked }))} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Sticky Header
          </label>
        </div>
        <div className="border-t border-zinc-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={headerConfig.showCta} onChange={(e) => setHeaderConfig((p: HeaderConfig) => ({ ...p, showCta: e.target.checked }))} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Show Header CTA
          </label>
          {headerConfig.showCta && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Button Label</span>
                <Input value={headerConfig.ctaLabel} onChange={(e) => setHeaderConfig((p: HeaderConfig) => ({ ...p, ctaLabel: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Button Link</span>
                <Input value={headerConfig.ctaHref} onChange={(e) => setHeaderConfig((p: HeaderConfig) => ({ ...p, ctaHref: e.target.value }))} />
              </label>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection title="Footer Configuration">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={footerConfig.showSocials} onChange={(e) => setFooterConfig((p: FooterConfig) => ({ ...p, showSocials: e.target.checked }))} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Show Social Icons
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={footerConfig.showPoweredBy} onChange={(e) => setFooterConfig((p: FooterConfig) => ({ ...p, showPoweredBy: e.target.checked }))} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Show &quot;Powered by Aldriva&quot;
          </label>
        </div>
        <label className="block pt-2">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Custom Copyright Text</span>
          <Input placeholder={`© ${new Date().getFullYear()} ${siteTitle}. All rights reserved.`} value={footerConfig.copyrightText} onChange={(e) => setFooterConfig((p: FooterConfig) => ({ ...p, copyrightText: e.target.value }))} />
        </label>
      </FormSection>
    </div>
  );
}
