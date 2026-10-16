import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { NEW_SITE_GALLERY_TEMPLATES } from "@/lib/website-template-v2";
import { createNeutralGallerySampleContent, getFoodOrderLocalizedCopy, getStoreLocalizedCopy, resolveV2TemplateGalleryPreview } from "@/lib/website-v2-template-preview";
import type { WebsiteCategory } from "@/lib/website-category";
import { v2ThemeStyle } from "@/lib/website-v2-theme";
import { WebsiteV2TemplateGalleryClient } from "./WebsiteV2TemplateGalleryClient";

interface WebsiteV2TemplateGalleryProps {
  organizerId: string;
  businessName: string;
  businessLogo: string | null;
  initialCategory: WebsiteCategory;
  canCreate: boolean;
}

async function V2TemplateCardPreview({
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
  const template = NEW_SITE_GALLERY_TEMPLATES.find((candidate) => candidate.id === templateId);
  const foodOrderCopy = templateId === "food-order"
    ? getFoodOrderLocalizedCopy(publicT as unknown as (key: string, values?: Record<string, string>) => string)
    : undefined;
  const storeCopy = templateId === "store"
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
    <div style={style} className="public-site min-h-full bg-[var(--ps-surface)] font-sans text-[var(--ps-text)]">
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
          <BlockRenderer key={block.id ?? `${template.id}-preview-${index}`} block={block} siteSlug={`template-preview-${template.id}`} scopeInternalLinks />
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

export async function WebsiteV2TemplateGallery({
  organizerId,
  businessName,
  businessLogo,
  initialCategory,
  canCreate,
}: WebsiteV2TemplateGalleryProps) {
  const cards: Array<{
    id: string;
    name: string;
    description: string;
    category: WebsiteCategory;
    supportedCategories: WebsiteCategory[];
    preview: ReactNode;
  }> = NEW_SITE_GALLERY_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    supportedCategories: template.supportedCategories,
    preview: <V2TemplateCardPreview templateId={template.id} businessName={businessName} businessLogo={businessLogo} />,
  }));

  return (
    <WebsiteV2TemplateGalleryClient
      organizerId={organizerId}
      initialCategory={initialCategory}
      cards={cards}
      canCreate={canCreate}
    />
  );
}
