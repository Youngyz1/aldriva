import { getFlagshipTemplate } from "./website-template-v2";
import { FLAGSHIP_SAMPLES } from "./website-template-samples";
import { normalizeContent, type ContentDoc } from "./website-content";
import { resolveTemplateContent, type TemplateResolutionOptions } from "./website-template-resolver";

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
  copy: Pick<TemplateResolutionOptions, "business" | "viewMenuLabel" | "rentalContactCta" | "primaryActionLabels" | "offeringsHeading" | "restaurantCtaBandHeading" | "rentalCtaBandHeading" | "timeZone"> = {}
): V2TemplateGalleryPreviewData | undefined {
  const template = getFlagshipTemplate(templateId);
  if (!template) return undefined;
  const content = normalizeContent({});
  return {
    templateId: template.id,
    templateVersion: template.version,
    content,
    sampleContent: FLAGSHIP_SAMPLES[template.id] ?? normalizeContent({}),
    resolved: resolveTemplateContent(template.id, template.version, content, {
      includeSamples: true,
      includeSourceMap: false,
      ...copy,
    }),
  };
}
