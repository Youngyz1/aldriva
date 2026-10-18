import type { ContentDoc, ContentKey } from "./website-content";

export function readSlotValue(
  content: ContentDoc,
  field: ContentKey,
  extraKey?: string
): unknown {
  if (!extraKey) {
    return content[field];
  }

  const extras = content.template_extras;
  if (extras && typeof extras === "object" && !Array.isArray(extras)) {
    return (extras as Record<string, unknown>)[extraKey];
  }

  return undefined;
}

export function applySlotValue(
  content: ContentDoc,
  field: ContentKey,
  extraKey: string | undefined,
  value: unknown
): ContentDoc {
  if (!extraKey) {
    return {
      ...content,
      [field]: value,
    } as ContentDoc;
  }

  const currentExtras = content.template_extras;
  const baseExtras =
    currentExtras && typeof currentExtras === "object" && !Array.isArray(currentExtras)
      ? (currentExtras as Record<string, unknown>)
      : {};
  return {
    ...content,
    template_extras: {
      ...baseExtras,
      [extraKey]: value,
    },
  } as ContentDoc;
}
