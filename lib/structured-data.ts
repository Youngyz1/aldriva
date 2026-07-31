export type JsonLdPrimitive = string | number | boolean | null | undefined;
export type JsonLdValue =
  | JsonLdPrimitive
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };

export function compactJsonLd<T extends JsonLdValue>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const compacted = value
      .map((item) => compactJsonLd(item))
      .filter((item): item is JsonLdValue => item !== undefined && item !== "");

    return compacted.length > 0 ? (compacted as T) : undefined;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compactJsonLd(item as JsonLdValue)] as const)
      .filter(([, item]) => {
        if (item === undefined || item === null || item === "") return false;
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      });

    return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
  }

  return value === null || value === undefined || value === "" ? undefined : value;
}

export function jsonLdScriptValue(value: JsonLdValue) {
  return JSON.stringify(compactJsonLd(value)).replace(/</g, "\\u003c");
}

export function stripHtml(value: string | null | undefined) {
  return value
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

export function absoluteUrl(
  value: string | null | undefined,
  baseUrl: string
) {
  if (!value) return undefined;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}
