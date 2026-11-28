/**
 * lib/storefront-settings.ts
 *
 * Owner-facing storefront settings that live in `tenant_websites.metadata`:
 * display currency (`metadata.storefront.currency`), site timezone
 * (`metadata.timezone`) and the closed-business ordering switch
 * (`metadata.storefront.acceptOrdersWhenClosed`).
 *
 * No new table or column: the existing metadata JSON is the home for all
 * three, so no migration is needed. The save core is client-injectable and
 * verifies by reading the row back.
 */

import { normalizeStorefrontCurrency, STOREFRONT_CURRENCIES } from "./money";
import { isValidIanaTimezone, resolveWebsiteTimezone } from "./date-timezone";

/** Default: a closed business still accepts orders for its next opening. */
export const DEFAULT_ACCEPT_ORDERS_WHEN_CLOSED = true;

export const STOREFRONT_CURRENCY_OPTIONS = STOREFRONT_CURRENCIES;

export interface StorefrontSettings {
  currency: string;
  timezone: string;
  acceptOrdersWhenClosed: boolean;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function storefrontRecord(metadata: unknown): Record<string, unknown> {
  const storefront = metadataRecord(metadata).storefront;
  return storefront && typeof storefront === "object" && !Array.isArray(storefront)
    ? (storefront as Record<string, unknown>)
    : {};
}

/** Read the three settings from a website metadata row, with defaults. */
export function readStorefrontSettings(metadata: unknown): StorefrontSettings {
  const storefront = storefrontRecord(metadata);
  return {
    currency: normalizeStorefrontCurrency(storefront.currency) ?? "USD",
    timezone: resolveWebsiteTimezone(metadata),
    acceptOrdersWhenClosed:
      typeof storefront.acceptOrdersWhenClosed === "boolean"
        ? storefront.acceptOrdersWhenClosed
        : DEFAULT_ACCEPT_ORDERS_WHEN_CLOSED,
  };
}

/** True unless the owner explicitly turned the closed-ordering switch off. */
export function resolveAcceptOrdersWhenClosed(metadata: unknown): boolean {
  return readStorefrontSettings(metadata).acceptOrdersWhenClosed;
}

/**
 * Country → suggested currency. This is ONLY a pre-selection for the creation
 * form; the owner can always change it and country never silently decides the
 * stored currency.
 */
export function suggestCurrencyForCountry(country: unknown): string {
  const normalized =
    typeof country === "string"
      ? country
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      : "";
  if (!normalized) return "USD";
  switch (normalized) {
    // West African CFA franc
    case "cote d'ivoire":
    case "ivory coast":
    case "ci":
    case "senegal":
    case "sn":
    case "mali":
    case "ml":
    case "burkina faso":
    case "bf":
    case "benin":
    case "bj":
    case "togo":
    case "tg":
    case "niger":
    case "ne":
    case "guinea-bissau":
    case "gw":
      return "XOF";
    // Central African CFA franc
    case "cameroon":
    case "cm":
    case "gabon":
    case "ga":
    case "chad":
    case "td":
    case "congo":
    case "cg":
      return "XAF";
    case "nigeria":
    case "ng":
      return "NGN";
    case "ghana":
    case "gh":
      return "GHS";
    case "kenya":
    case "ke":
      return "KES";
    case "south africa":
    case "za":
      return "ZAR";
    case "tanzania":
    case "tz":
      return "TZS";
    case "uganda":
    case "ug":
      return "UGX";
    case "rwanda":
    case "rw":
      return "RWF";
    case "morocco":
    case "ma":
      return "MAD";
    case "egypt":
    case "eg":
      return "EGP";
    case "united arab emirates":
    case "ae":
      return "AED";
    case "india":
    case "in":
      return "INR";
    case "brazil":
    case "br":
      return "BRL";
    case "mexico":
    case "mx":
      return "MXN";
    case "united kingdom":
    case "uk":
    case "gb":
      return "GBP";
    case "france":
    case "fr":
    case "germany":
    case "de":
    case "spain":
    case "es":
    case "italy":
    case "it":
    case "netherlands":
    case "nl":
    case "belgium":
    case "be":
    case "portugal":
    case "pt":
      return "EUR";
    case "canada":
    case "ca":
      return "CAD";
    case "switzerland":
    case "ch":
      return "CHF";
    case "australia":
    case "au":
      return "AUD";
    case "japan":
    case "jp":
      return "JPY";
    default:
      return "USD";
  }
}

export type StorefrontSettingsField = "currency" | "timezone" | "acceptOrdersWhenClosed";

export interface SaveStorefrontSettingsInput {
  websiteId: string;
  currency?: unknown;
  timezone?: unknown;
  acceptOrdersWhenClosed?: unknown;
}

export interface StorefrontSettingsClient {
  from(table: string): {
    select(columns?: string): any;
    update(values: Record<string, unknown>): any;
  };
}

export type StorefrontSettingsResult =
  | { success: true; data: StorefrontSettings }
  | { success: false; code: "validation_error" | "not_found" | "db_error" | "unexpected"; error: string };

/**
 * Merge and persist storefront settings into `tenant_websites.metadata`,
 * then read the row back. Invalid currency/timezone codes are rejected with a
 * clear error; nothing is written. `undefined` fields are left untouched.
 */
export async function saveStorefrontSettingsWithClient(
  input: SaveStorefrontSettingsInput,
  admin: StorefrontSettingsClient
): Promise<StorefrontSettingsResult> {
  const websiteId = typeof input.websiteId === "string" ? input.websiteId.trim() : "";
  if (!websiteId) {
    return { success: false, code: "validation_error", error: "Website is required." };
  }

  let currency: string | undefined;
  if (input.currency !== undefined) {
    currency = normalizeStorefrontCurrency(input.currency);
    if (!currency) {
      return {
        success: false,
        code: "validation_error",
        error: `Currency must be one of: ${STOREFRONT_CURRENCIES.join(", ")}.`,
      };
    }
  }

  let timezone: string | undefined;
  if (input.timezone !== undefined) {
    const zone = typeof input.timezone === "string" ? input.timezone.trim() : "";
    if (!isValidIanaTimezone(zone)) {
      return { success: false, code: "validation_error", error: "Time zone must be a valid IANA identifier." };
    }
    timezone = zone;
  }

  let acceptOrdersWhenClosed: boolean | undefined;
  if (input.acceptOrdersWhenClosed !== undefined) {
    if (typeof input.acceptOrdersWhenClosed !== "boolean") {
      return { success: false, code: "validation_error", error: "Accept orders when closed must be on or off." };
    }
    acceptOrdersWhenClosed = input.acceptOrdersWhenClosed;
  }

  if (currency === undefined && timezone === undefined && acceptOrdersWhenClosed === undefined) {
    return { success: false, code: "validation_error", error: "Nothing to save." };
  }

  try {
    const { data: row, error: readError } = await admin
      .from("tenant_websites")
      .select("id, metadata")
      .eq("id", websiteId)
      .maybeSingle();
    if (readError || !row) {
      return { success: false, code: "not_found", error: "Website not found." };
    }

    const current = metadataRecord((row as { metadata?: unknown }).metadata);
    const nextStorefront = { ...storefrontRecord(current) };
    if (currency !== undefined) nextStorefront.currency = currency;
    if (acceptOrdersWhenClosed !== undefined) nextStorefront.acceptOrdersWhenClosed = acceptOrdersWhenClosed;
    const nextMetadata: Record<string, unknown> = { ...current, storefront: nextStorefront };
    if (timezone !== undefined) nextMetadata.timezone = timezone;

    const { error: writeError } = await admin
      .from("tenant_websites")
      .update({ metadata: nextMetadata })
      .eq("id", websiteId);
    if (writeError) {
      return { success: false, code: "db_error", error: "Failed to save storefront settings." };
    }

    const { data: verifyRow, error: verifyError } = await admin
      .from("tenant_websites")
      .select("metadata")
      .eq("id", websiteId)
      .maybeSingle();
    if (verifyError || !verifyRow) {
      return { success: false, code: "db_error", error: "Storefront settings could not be verified after saving." };
    }

    const saved = readStorefrontSettings((verifyRow as { metadata?: unknown }).metadata);
    if (
      (currency !== undefined && saved.currency !== currency) ||
      (timezone !== undefined && saved.timezone !== timezone) ||
      (acceptOrdersWhenClosed !== undefined && saved.acceptOrdersWhenClosed !== acceptOrdersWhenClosed)
    ) {
      return { success: false, code: "db_error", error: "Storefront settings could not be verified after saving." };
    }

    return { success: true, data: saved };
  } catch {
    return { success: false, code: "unexpected", error: "Failed to save storefront settings." };
  }
}
