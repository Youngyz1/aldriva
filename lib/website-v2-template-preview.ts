import { getFlagshipTemplate } from "./website-template-v2";
import { FLAGSHIP_SAMPLES } from "./website-template-samples";
import { normalizeContent, type ContentDoc } from "./website-content";
import { resolveTemplateContent, type TemplateResolutionOptions } from "./website-template-resolver";

export interface NeutralGallerySampleCopy {
  tagline: string;
  headline: string;
  subtext: string;
  about: string;
  featureTitle: string;
  featureDescription: string;
  callToAction: string;
  home: string;
  catalog: string;
  aboutNav: string;
  contact: string;
  process: string;
  faq: string;
  pricing: string;
}

/** Neutral, render-only preview text tied to the owner identity, with no stock imagery or fake contact data. */
export function createNeutralGallerySampleContent(
  templateId: string,
  businessName: string,
  logoUrl: string | null | undefined,
  copy: NeutralGallerySampleCopy
): ContentDoc {
  const shared = {
    business_name: businessName,
    ...(logoUrl ? { logo_url: logoUrl } : {}),
    tagline: copy.tagline,
    hero_headline: copy.headline.replace("{business}", businessName),
    hero_subtext: copy.subtext,
    primary_cta_label: copy.callToAction,
    about_text: copy.about,
    highlights: [
      { title: copy.featureTitle, description: copy.featureDescription },
      { title: copy.contact, description: copy.about },
      { title: copy.catalog, description: copy.subtext },
    ],
    trust: [
      { title: copy.featureTitle, description: copy.featureDescription },
      { title: copy.contact, description: copy.about },
      { title: copy.catalog, description: copy.subtext },
    ],
    steps: [
      { title: copy.featureTitle, description: copy.featureDescription },
      { title: copy.catalog, description: copy.subtext },
      { title: copy.contact, description: copy.about },
    ],
    testimonials: [],
    faq: [],
    gallery_images: [],
    nav_labels: {
      home: copy.home,
      menu: copy.catalog,
      fleet: copy.catalog,
      about: copy.aboutNav,
      how: copy.process,
      pricing: copy.pricing,
      faq: copy.faq,
      contact: copy.contact,
    },
  };
  return normalizeContent(shared as Partial<ContentDoc>);
}

export interface V2TemplateGalleryPreviewData {
  templateId: string;
  templateVersion: string;
  content: ContentDoc;
  sampleContent: ContentDoc;
  resolved: ReturnType<typeof resolveTemplateContent>;
}

/** Render-only preview data. It contains no save payload or persisted sample fields. */
export function resolveV2TemplateGalleryPreview(
  templateId: string,
  copy: Pick<TemplateResolutionOptions, "siteSlug" | "business" | "viewMenuLabel" | "rentalContactCta" | "primaryActionLabels" | "offeringsHeading" | "restaurantCtaBandHeading" | "rentalCtaBandHeading" | "timeZone"> & { sampleContentOverride?: ContentDoc } = {}
): V2TemplateGalleryPreviewData | undefined {
  const template = getFlagshipTemplate(templateId);
  if (!template) return undefined;
  const content = normalizeContent({});
  return {
    templateId: template.id,
    templateVersion: template.version,
    content,
    sampleContent: copy.sampleContentOverride ?? FLAGSHIP_SAMPLES[template.id] ?? normalizeContent({}),
    resolved: resolveTemplateContent(template.id, template.version, content, {
      includeSamples: true,
      includeSourceMap: false,
      ...copy,
    }),
  };
}
