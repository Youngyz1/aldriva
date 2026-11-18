import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { MobileTabBar } from "@/components/site/v2/MobileTabBar";
import { normalizeContent } from "@/lib/website-content";
import { SHOWCASE_SAMPLES } from "@/lib/website-template-samples";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import { v2ThemeStyle } from "@/lib/website-v2-theme";

// Development-only Showcase renderer. Renders the resolved template with
// sample content (default) or with owner-only content (`?mode=live`) so the
// template can be screenshotted at 390px and 1280px without a database.
// 404s in production unless ENABLE_SHOWCASE_PREVIEW=1.
const PREVIEW_ENABLED = process.env.ENABLE_SHOWCASE_PREVIEW === "1";

interface Props {
  searchParams: Promise<{ page?: string; mode?: string }>;
}

export default async function ShowcasePreviewPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production" && !PREVIEW_ENABLED) {
    notFound();
  }

  const { page: pageParam, mode } = await searchParams;
  const live = mode === "live";
  const template = getFlagshipTemplate("showcase");
  if (!template) notFound();

  const siteSlug = "showcase-preview";
  const content = normalizeContent(live ? {} : SHOWCASE_SAMPLES);
  const resolved = resolveTemplateContent(template.id, template.version, content, {
    includeSamples: !live,
    includeSourceMap: false,
    siteSlug,
  });

  const target = resolved.pages.find((entry) => entry.slug === (pageParam || "home")) ?? resolved.pages[0];
  if (!target) notFound();

  const themeStyle = {
    ...v2ThemeStyle(template),
    backgroundColor: v2ThemeStyle(template)["--tf-base"],
  };
  const samples = live ? normalizeContent({}) : normalizeContent(SHOWCASE_SAMPLES);
  const siteTitle = typeof content.business_name === "string" && content.business_name.trim()
    ? content.business_name
    : "Your business";
  const hasPublishedMenuPage = resolved.pages.some((entry) => entry.slug === "menu");
  const hasMenuEmbedOnPage = target.blocks.some((block) => (block as { type?: string }).type === "menu_embed");
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
      <V2SiteHeader
        template={template}
        content={content}
        sampleContent={samples}
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
      />

      <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {target.blocks.map((block, index) => (
          <BlockRenderer
            key={block.id ?? `showcase-preview-${index}`}
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
        sampleContent={samples}
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
