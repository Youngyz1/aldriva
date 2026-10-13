import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { FLAGSHIP_TEMPLATES } from "@/lib/website-template-v2";
import { getV2GalleryCategories } from "@/lib/website-v2-create-flow";
import { resolveV2TemplateGalleryPreview } from "@/lib/website-v2-template-preview";
import type { WebsiteCategory } from "@/lib/website-category";
import { v2ThemeStyle } from "@/lib/website-v2-theme";
import { WebsiteV2TemplateGalleryClient } from "./WebsiteV2TemplateGalleryClient";

interface WebsiteV2TemplateGalleryProps {
  organizerId: string;
  initialCategory: WebsiteCategory;
  canCreate: boolean;
}

async function V2TemplateCardPreview({ templateId }: { templateId: string }) {
  const storeT = await getTranslations("Storefront");
  const template = FLAGSHIP_TEMPLATES.find((candidate) => candidate.id === templateId);
  const preview = resolveV2TemplateGalleryPreview(templateId, {
    business: templateId === "rental-driveline"
      ? { industry: "Automotive & Transportation", category: "Vehicle Rental", businessType: "Car Rental" }
      : { industry: "Food & Beverage", category: "Restaurant", businessType: "Full-Service Restaurant" },
    viewMenuLabel: storeT("viewMenu"),
    rentalContactCta: storeT("rentalContactCta"),
    primaryActionLabels: {
      orderNow: storeT("orderNow"),
      reserveTable: storeT("reserveTable"),
      bookNow: storeT("bookNow"),
      viewMenu: storeT("viewMenu"),
      contact: storeT("contact"),
      rentalContactCta: storeT("rentalContactCta"),
    },
    offeringsHeading: storeT("whatWeOffer"),
    restaurantCtaBandHeading: storeT("restaurantBrandMessage"),
    rentalCtaBandHeading: storeT("rentalBrandMessage"),
  });
  if (!template || !preview) return null;

  const home = preview.resolved.pages.find((page) => page.isHome) ?? preview.resolved.pages[0];
  if (!home) return null;

  const style = v2ThemeStyle(template) as CSSProperties;
  return (
    <div style={style} className="min-h-full bg-white font-sans text-zinc-900">
      <V2SiteHeader
        template={template}
        content={preview.content}
        sampleContent={preview.sampleContent}
        navigation={preview.resolved.navigation}
        siteTitle={template.name}
        siteSlug={`template-preview-${template.id}`}
        previewMode
        storefrontFeatures={preview.resolved.storefrontFeatures}
        primaryAction={preview.resolved.primaryAction.primary}
      />
      <main>
        {home.blocks.map((block, index) => (
          <BlockRenderer key={block.id ?? `${template.id}-preview-${index}`} block={block} />
        ))}
      </main>
      <V2SiteFooter
        template={template}
        content={preview.content}
        sampleContent={preview.sampleContent}
        navigation={preview.resolved.navigation}
        siteTitle={template.name}
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
  }> = FLAGSHIP_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    supportedCategories: template.supportedCategories,
    preview: <V2TemplateCardPreview templateId={template.id} />,
  }));

  return (
    <WebsiteV2TemplateGalleryClient
      organizerId={organizerId}
      initialCategory={initialCategory}
      categories={getV2GalleryCategories()}
      cards={cards}
      canCreate={canCreate}
    />
  );
}
