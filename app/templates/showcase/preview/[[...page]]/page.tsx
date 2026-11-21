import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { MobileTabBar } from "@/components/site/v2/MobileTabBar";
import { ShowcaseHomeSearch } from "@/components/site/blocks/ShowcaseHomeSearch";
import { normalizeContent } from "@/lib/website-content";
import { SHOWCASE_SAMPLES } from "@/lib/website-template-samples";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import { v2ThemeStyle } from "@/lib/website-v2-theme";

// Public, always-reachable template preview for prospective customers —
// unlike app/dev/showcase-preview (internal, dev/flag-gated), this route is
// never 404'd and carries no auth requirement. proxy.ts is not configured to
// protect /templates/*, so no auth redirect applies here.
export const metadata: Metadata = {
  title: "Showcase template preview | Aldriva",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ page?: string[] }>;
}

export default async function ShowcaseTemplatePublicPreviewPage({ params }: Props) {
  const { page: pageSegments } = await params;
  const pageSlug = pageSegments && pageSegments.length > 0 ? pageSegments[0] : "home";

  const template = getFlagshipTemplate("showcase");
  if (!template) notFound();

  const siteSlug = "showcase-preview";
  const content = normalizeContent(SHOWCASE_SAMPLES);
  const resolved = resolveTemplateContent(template.id, template.version, content, {
    includeSamples: true,
    includeSourceMap: false,
    // No linked business record here, so ordering/pickup would otherwise
    // resolve to "off" — force them on so the preview shows the real Showcase
    // ordering/cart UI, matching what a live Showcase site offers.
    business: {
      offerings: ["online_ordering", "pickup"],
      capabilities: ["ONLINE_ORDERING", "PICKUP"],
    },
    siteSlug,
  });

  const target = resolved.pages.find((entry) => entry.slug === pageSlug) ?? resolved.pages[0];
  if (!target) notFound();

  const themeStyle = {
    ...v2ThemeStyle(template),
    backgroundColor: v2ThemeStyle(template)["--tf-base"],
  };
  const siteTitle = "Your business";
  const hasPublishedMenuPage = resolved.pages.some((entry) => entry.slug === "menu");
  const hasMenuEmbedOnPage = target.blocks.some((block) => block.type === "menu_embed");
  const accentColor = v2ThemeStyle(template)["--ps-accent"];

  const orderConfig = resolved.storefrontFeatures.ordering
    ? {
        enabled: true,
        slug: siteSlug,
        currency: "USD",
        offerings: [
          ...(resolved.storefrontFeatures.pickup ? ["pickup"] : []),
          ...(resolved.storefrontFeatures.delivery ? ["delivery"] : []),
        ],
        onlinePayment: false,
        isClosed: false,
        scheduledFor: null,
        blocked: false,
        deliveryFee: 0,
        freeDeliveryAbove: null,
      }
    : undefined;

  return (
    <div
      style={themeStyle}
      data-site-template={template.id}
      className="public-site min-h-screen flex flex-col bg-[var(--ps-surface)] text-[var(--ps-text)]"
    >
      {/* Minimal header + slim action bar, combined into one row. Navbar is
          excluded on this route, so the logo/Log in link here is the only
          way back to / or to /login. Not sticky: V2SiteHeader below is
          itself sticky top-0, and stacking two competing sticky bars at the
          same offset without also patching that shared component would make
          this bar get covered by it on scroll. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 text-sm">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Aldriva home">
            <BrandMark className="[&>img]:h-7 [&>img]:max-w-[6rem]" />
          </Link>
          <Link href="/templates" className="font-semibold text-zinc-700 hover:text-orange-600">
            ← Back to templates
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="font-semibold text-zinc-700 hover:text-orange-600">
            Log in
          </Link>
          <Link
            href="/dashboard/website/new?templateId=showcase"
            className="rounded-xl bg-zinc-950 px-4 py-2 font-semibold text-white transition hover:bg-zinc-800"
          >
            Use this template
          </Link>
        </div>
      </div>

      <V2SiteHeader
        template={template}
        content={content}
        sampleContent={content}
        navigation={resolved.navigation}
        siteTitle={siteTitle}
        siteSlug={siteSlug}
        previewMode={false}
        editMode={false}
        sourceMap={resolved.chromeSourceMap.menuBar}
        storefrontFeatures={resolved.storefrontFeatures}
        primaryAction={resolved.primaryAction.primary}
        availablePageSlugs={resolved.pages.map((entry) => entry.slug)}
        overHero={false}
        hideHamburger
        orderConfig={orderConfig}
      />

      {target.isHome ? <ShowcaseHomeSearch siteSlug={siteSlug} /> : null}

      <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {target.blocks.map((block, index) => (
          <BlockRenderer
            key={block.id ?? `showcase-template-preview-${index}`}
            block={block}
            editMode={false}
            scopeInternalLinks
            currency="USD"
            currencyLocale="en"
            orderConfig={orderConfig}
            siteSlug={siteSlug}
            hasPublishedMenuPage={hasPublishedMenuPage}
            hasMenuEmbedOnPage={hasMenuEmbedOnPage}
            accentColor={accentColor}
            siteTemplateId={template.id}
            sectionAlign={template.sectionAlign}
            businessName={siteTitle}
          />
        ))}
      </main>

      <V2SiteFooter
        template={template}
        content={content}
        sampleContent={content}
        navigation={resolved.navigation}
        siteTitle={siteTitle}
        siteSlug={siteSlug}
        previewMode={false}
        editMode={false}
        sourceMap={resolved.chromeSourceMap.footer}
        storefrontFeatures={resolved.storefrontFeatures}
        availablePageSlugs={resolved.pages.map((entry) => entry.slug)}
        todayHours={resolved.todayHours}
      />

      <MobileTabBar
        siteSlug={siteSlug}
        navigation={resolved.navigation}
        storefrontFeatures={resolved.storefrontFeatures}
        activePageSlug={target.slug}
      />
    </div>
  );
}
