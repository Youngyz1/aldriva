import { getCapabilitiesForBusiness } from "./business-taxonomy";
import { normalizeCurrencyCode } from "./website-blocks";
import type { TemplateResolutionOptions } from "./website-template-resolver";

export interface LinkedBusinessTemplateInput {
  industry?: string | null;
  category?: string | null;
  business_type?: string | null;
  businessType?: string | null;
  offerings?: unknown;
}

export interface WebsiteTemplateSiteInput {
  siteSlug: string;
  currency?: unknown;
  metadata?: unknown;
  linkedBusiness?: LinkedBusinessTemplateInput | null;
}

/** Build stable site resolver inputs. Approval is a runtime-only gate. */
export function buildWebsiteTemplateResolverInputs(
  input: WebsiteTemplateSiteInput
): Pick<TemplateResolutionOptions, "siteSlug" | "currency" | "timeZone" | "business"> {
  const linkedBusiness = input.linkedBusiness;
  const industry = linkedBusiness?.industry ?? "";
  const category = linkedBusiness?.category ?? "";
  const businessType = linkedBusiness?.business_type ?? linkedBusiness?.businessType ?? null;
  const capabilities = getCapabilitiesForBusiness(industry, category, businessType ?? "");
  const metadata = input.metadata && typeof input.metadata === "object"
    ? input.metadata as Record<string, unknown>
    : {};

  return {
    siteSlug: input.siteSlug,
    currency: normalizeCurrencyCode(input.currency),
    timeZone: typeof metadata.timezone === "string" && metadata.timezone.trim()
      ? metadata.timezone.trim()
      : undefined,
    business: {
      industry,
      category,
      businessType,
      offerings: Array.isArray(linkedBusiness?.offerings)
        ? linkedBusiness.offerings.filter((key): key is string => typeof key === "string")
        : [],
      capabilities,
    },
  };
}
