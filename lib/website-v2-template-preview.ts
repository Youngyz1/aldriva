import { getFlagshipTemplate } from "./website-template-v2";
import { FLAGSHIP_SAMPLES } from "./website-template-samples";
import { normalizeContent, type ContentDoc } from "./website-content";
import { resolveTemplateContent, type TemplateResolutionOptions } from "./website-template-resolver";

export interface FoodOrderLocalizedCopy {
  sample: NonNullable<NeutralGallerySampleCopy["foodOrder"]>;
  resolver: NonNullable<TemplateResolutionOptions["foodOrderCopy"]>;
}

export interface StoreLocalizedCopy {
  sample: NonNullable<NeutralGallerySampleCopy["store"]>;
  resolver: NonNullable<TemplateResolutionOptions["storeCopy"]>;
}

/** Resolves the Food Order-only copy through the active EN/FR message catalog. */
export function getFoodOrderLocalizedCopy(
  translate: (key: string, values?: Record<string, string>) => string
): FoodOrderLocalizedCopy {
  const navigationLabels = {
    home: translate("home"),
    menu: translate("catalog"),
    order: translate("foodOrderNavOrder"),
    reservations: translate("foodOrderNavReservations"),
    about: translate("about"),
    contact: translate("contact"),
  };
  return {
    sample: {
      tagline: translate("foodOrderSampleTagline"),
      headline: translate("foodOrderSampleHeadline", { business: "{business}" }),
      subtext: translate("foodOrderSampleSubtext"),
      about: translate("foodOrderSampleAbout", { business: "{business}" }),
      primaryAction: translate("foodOrderSamplePrimaryAction"),
      secondaryAction: translate("foodOrderSampleSecondaryAction"),
      steps: [
        { title: translate("foodOrderSampleStepOneTitle"), description: translate("foodOrderSampleStepOneDescription") },
        { title: translate("foodOrderSampleStepTwoTitle"), description: translate("foodOrderSampleStepTwoDescription") },
        { title: translate("foodOrderSampleStepThreeTitle"), description: translate("foodOrderSampleStepThreeDescription") },
      ],
      navigationLabels,
    },
    resolver: {
      stepsHeading: translate("foodOrderStepsHeading"),
      popularItemsHeading: translate("foodOrderPopularItemsHeading"),
      menuPageHeading: translate("foodOrderMenuPageHeading"),
      orderPageHeading: translate("foodOrderOrderPageHeading"),
      offerHeading: translate("foodOrderOfferHeading"),
      offerSubheading: translate("foodOrderOfferSubheading"),
      contactHeading: translate("foodOrderContactHeading"),
      navigationLabels,
    },
  };
}

/** Resolves Store preview and resolver copy through the active EN/FR catalog. */
export function getStoreLocalizedCopy(
  translate: (key: string, values?: Record<string, string>) => string
): StoreLocalizedCopy {
  const navigationLabels = {
    home: translate("home"),
    shop: translate("storeNavShop"),
    contact: translate("contact"),
  };
  return {
    sample: {
      tagline: translate("storeSampleTagline"),
      headline: translate("storeSampleHeadline", { business: "{business}" }),
      subtext: translate("storeSampleSubtext"),
      primaryAction: translate("storeShopNow"),
      trustText: `${translate("storeSampleTrustTitle")} ${translate("storeSampleTrustDescription")}`,
      navigationLabels,
    },
    resolver: {
      homeProductsHeading: translate("storeHomeProductsHeading"),
      shopHeading: translate("storeShopHeading"),
      trustHeading: translate("storeTrustHeading"),
      trustItemHeading: translate("storeTrustItemHeading"),
      navigationLabels,
    },
  };
}

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
  foodOrder?: {
    tagline: string;
    headline: string;
    subtext: string;
    about: string;
    primaryAction: string;
    secondaryAction: string;
    steps: Array<{ title: string; description: string }>;
    navigationLabels: Record<string, string>;
  };
  store?: {
    tagline: string;
    headline: string;
    subtext: string;
    primaryAction: string;
    trustText: string;
    navigationLabels: Record<string, string>;
  };
}

/** Neutral, render-only preview text tied to the owner identity, with no stock imagery or fake contact data. */
export function createNeutralGallerySampleContent(
  templateId: string,
  businessName: string,
  logoUrl: string | null | undefined,
  copy: NeutralGallerySampleCopy
): ContentDoc {
  const shared: Partial<ContentDoc> = {
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
  if (templateId === "food-order" && copy.foodOrder) {
    shared.tagline = copy.foodOrder.tagline;
    shared.hero_headline = copy.foodOrder.headline.replace("{business}", businessName);
    shared.hero_subtext = copy.foodOrder.subtext;
    shared.about_text = copy.foodOrder.about;
    shared.primary_cta_label = copy.foodOrder.primaryAction;
    shared.secondary_cta_label = copy.foodOrder.secondaryAction;
    shared.steps = copy.foodOrder.steps;
    shared.nav_labels = {
      ...((shared.nav_labels ?? {}) as Record<string, string>),
      ...copy.foodOrder.navigationLabels,
    };
    shared.about_text = copy.foodOrder.about.replace("{business}", businessName);
  }
  if (templateId === "store" && copy.store) {
    shared.tagline = copy.store.tagline;
    shared.hero_headline = copy.store.headline.replace("{business}", businessName);
    shared.hero_subtext = copy.store.subtext;
    shared.primary_cta_label = copy.store.primaryAction;
    shared.template_extras = { storeTrustText: copy.store.trustText };
    shared.nav_labels = copy.store.navigationLabels;
  }
  return normalizeContent(shared);
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
  copy: Pick<TemplateResolutionOptions, "siteSlug" | "business" | "viewMenuLabel" | "rentalContactCta" | "primaryActionLabels" | "offeringsHeading" | "restaurantCtaBandHeading" | "rentalCtaBandHeading" | "foodOrderCopy" | "storeCopy" | "timeZone"> & { sampleContentOverride?: ContentDoc } = {}
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
