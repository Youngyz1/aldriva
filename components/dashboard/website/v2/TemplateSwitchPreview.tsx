import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import {
  createNeutralGallerySampleContent,
  getFoodOrderLocalizedCopy,
  getStoreLocalizedCopy,
  resolveV2TemplateGalleryPreview,
} from "@/lib/website-v2-template-preview";
import { v2ThemeStyle } from "@/lib/website-v2-theme";
import { savannahArimoFont } from "@/lib/site-fonts";

/**
 * Server-rendered template preview for the Change-template dialog.
 * Reuses the exact gallery card preview pipeline (sample content builders +
 * resolver + site header/blocks/footer) with the owner's name and logo.
 */
export async function TemplateSwitchPreview({
  templateId,
  businessName,
  businessLogo,
}: {
  templateId: string;
  businessName: string;
  businessLogo: string | null;
}) {
  const storeT = await getTranslations("Storefront");
  const publicT = await getTranslations("PublicSite");
  const template = getFlagshipTemplate(templateId);
  const foodOrderCopy =
    templateId === "food-order"
      ? getFoodOrderLocalizedCopy(publicT as unknown as (key: string, values?: Record<string, string>) => string)
      : undefined;
  const storeCopy =
    templateId === "store"
      ? getStoreLocalizedCopy(publicT as unknown as (key: string, values?: Record<string, string>) => string)
      : undefined;
  const sampleContent = createNeutralGallerySampleContent(templateId, businessName, businessLogo, {
    tagline: publicT("previewTagline"),
    headline: publicT("previewHeadline", { business: "{business}" }),
    subtext: publicT("previewSubtext"),
    about: publicT("previewAbout"),
    featureTitle: publicT("previewFeatureTitle"),
    featureDescription: publicT("previewFeatureDescription"),
    callToAction: publicT("previewExplore"),
    home: publicT("home"),
    catalog: publicT("catalog"),
    aboutNav: publicT("about"),
    contact: publicT("contact"),
    process: publicT("process"),
    faq: publicT("faq"),
    pricing: publicT("pricing"),
    ...(foodOrderCopy ? { foodOrder: foodOrderCopy.sample } : {}),
    ...(storeCopy ? { store: storeCopy.sample } : {}),
  });
  const preview = resolveV2TemplateGalleryPreview(templateId, {
    siteSlug: `template-preview-${templateId}`,
    business: {},
    sampleContentOverride: sampleContent,
    viewMenuLabel: storeT("viewMenu"),
    rentalContactCta: storeT("rentalContactCta"),
    primaryActionLabels: {
      orderNow: storeT("orderNow"),
      reserveTable: storeT("reserveTable"),
      bookNow: storeT("bookNow"),
      viewMenu: storeT("viewMenu"),
      viewProducts: storeT("viewProducts"),
      shopNow: storeT("shopNow"),
      contact: storeT("contact"),
      rentalContactCta: storeT("rentalContactCta"),
    },
    offeringsHeading: storeT("whatWeOffer"),
    restaurantCtaBandHeading: publicT("previewBrandMessage"),
    rentalCtaBandHeading: publicT("previewBrandMessage"),
    foodOrderCopy: foodOrderCopy?.resolver,
    storeCopy: storeCopy?.resolver,
  });
  if (!template || !preview) return null;

  const home = preview.resolved.pages.find((page) => page.isHome) ?? preview.resolved.pages[0];
  if (!home) return null;

  const style = v2ThemeStyle(template) as CSSProperties;
  return (
    <div style={style} className={template.id === "restaurant-savannah"
      ? `public-site min-h-full bg-[var(--ps-surface)] font-sans text-[var(--ps-text)] ${savannahArimoFont.variable}`
      : "public-site min-h-full bg-[var(--ps-surface)] font-sans text-[var(--ps-text)]"}>
      <V2SiteHeader
        template={template}
        content={preview.content}
        sampleContent={preview.sampleContent}
        navigation={preview.resolved.navigation}
        siteTitle={businessName}
        siteSlug={`template-preview-${template.id}`}
        previewMode
        storefrontFeatures={preview.resolved.storefrontFeatures}
        primaryAction={preview.resolved.primaryAction.primary}
      />
      <main>
        {home.blocks.map((block, index) => (
          <BlockRenderer key={block.id ?? `${template.id}-preview-${index}`} block={block} siteSlug={`template-preview-${template.id}`} scopeInternalLinks {...(template.id === "restaurant-savannah" ? { siteTemplateId: template.id, sectionAlign: template.sectionAlign, businessName } : {})} />
        ))}
      </main>
      <V2SiteFooter
        template={template}
        content={preview.content}
        sampleContent={preview.sampleContent}
        navigation={preview.resolved.navigation}
        siteTitle={businessName}
        siteSlug={`template-preview-${template.id}`}
        previewMode
        storefrontFeatures={preview.resolved.storefrontFeatures}
        todayHours={preview.resolved.todayHours}
      />
    </div>
  );
}
