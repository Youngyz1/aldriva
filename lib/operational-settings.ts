/**
 * lib/operational-settings.ts
 *
 * Testable persistence core for organizer operational settings (opening hours
 * + site time zone). No "use server", no next/* imports, no auth — auth and
 * revalidation live in the thin wrappers in lib/actions/website-content.ts.
 * The admin client is injected, so behavior tests run against an in-memory
 * mock instead of a database.
 *
 * Canonical hours source is website_content.content.hours (shared with the
 * website builder). A save writes the hours key into BOTH the live document
 * (what the website footer, dashboard, order scheduling, and reservations
 * read) and the existing draft document (what the builder reads,
 * draft-first) — merging ONLY the hours key so unrelated unpublished draft
 * edits are never clobbered. The draft UPDATE fires the version trigger
 * (migration_168), so a builder open elsewhere gets STALE_DRAFT and reloads
 * instead of silently overwriting the change.
 *
 * Settings NEVER creates a draft row: publish_content_draft replaces the
 * whole live document with the draft, so a minimal hours-only draft would
 * wipe the live site on publish. Hours saved in Settings are already live;
 * the builder Publish button says so when there is nothing to publish.
 */

import type { OrderSubmitClient } from "@/lib/order-submit";
import {
  normalizeContent,
  normalizeHours,
  type ContentDoc,
  type ContentHours,
} from "@/lib/website-content";
import { defaultTimezoneForCountry, isValidIanaTimezone } from "@/lib/date-timezone";

export interface OperationalSettingsData {
  websiteId: string | null;
  websiteSlug: string | null;
  isPublished: boolean;
  hasWebsite: boolean;
  hasBusiness: boolean;
  /** Draft-first hours (what the builder shows). */
  hours: ContentHours | null;
  hoursSource: "draft" | "live" | null;
  hasDraftHours: boolean;
  hasLiveHours: boolean;
  /** Owner's explicit choice (null = country/platform default applies). */
  timezone: string | null;
  timezoneDefault: string;
  businessCountry: string | null;
}

export type OperationalResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string };

/** Single website-resolution rule: earliest-created site for the tenant. */
export async function resolveOperationalWebsite(organizerId: string, admin: OrderSubmitClient) {
  const [{ data: website }, { data: businesses }] = await Promise.all([
    admin
      .from("tenant_websites")
      .select("id, slug, status, published_at, metadata")
      .eq("tenant_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("businesses")
      .select("id, country")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  return { website, businesses: (businesses ?? []) as { id: string; country?: unknown }[] };
}

function readHours(doc: unknown): ContentHours | null {
  return normalizeHours(normalizeContent((doc ?? {}) as Record<string, unknown>).hours) ?? null;
}

/** Testable core of the Settings operational-section read. */
export async function getOperationalSettingsWithClient(
  organizerId: string,
  admin: OrderSubmitClient
): Promise<OperationalResult<OperationalSettingsData>> {
  try {
    const { website, businesses } = await resolveOperationalWebsite(organizerId, admin);
    const businessCountry =
      typeof businesses[0]?.country === "string" && businesses[0].country.trim()
        ? businesses[0].country.trim()
        : null;
    const base: OperationalSettingsData = {
      websiteId: null,
      websiteSlug: null,
      isPublished: false,
      hasWebsite: false,
      hasBusiness: businesses.length > 0,
      hours: null,
      hoursSource: null,
      hasDraftHours: false,
      hasLiveHours: false,
      timezone: null,
      timezoneDefault: defaultTimezoneForCountry(businessCountry),
      businessCountry,
    };
    if (!website) return { success: true, data: base };

    const meta =
      (website as { metadata?: unknown }).metadata && typeof (website as { metadata?: unknown }).metadata === "object"
        ? ((website as { metadata?: unknown }).metadata as Record<string, unknown>)
        : {};
    const storedTz =
      typeof meta.timezone === "string" && meta.timezone.trim() ? meta.timezone.trim() : null;

    const [{ data: liveRow }, { data: draftRow }] = await Promise.all([
      admin.from("website_content").select("content").eq("website_id", (website as { id: string }).id).maybeSingle(),
      admin.from("website_content_drafts").select("content").eq("website_id", (website as { id: string }).id).maybeSingle(),
    ]);
    const liveHours = readHours((liveRow as { content?: unknown } | null)?.content);
    const draftHours = draftRow ? readHours((draftRow as { content?: unknown }).content) : null;

    return {
      success: true,
      data: {
        ...base,
        websiteId: (website as { id: string }).id,
        websiteSlug: ((website as { slug?: unknown }).slug as string) ?? null,
        isPublished: Boolean((website as { published_at?: unknown }).published_at),
        hasWebsite: true,
        hours: draftHours ?? liveHours,
        hoursSource: draftHours ? "draft" : liveHours ? "live" : null,
        hasDraftHours: draftHours !== null,
        hasLiveHours: liveHours !== null,
        timezone: storedTz,
      },
    };
  } catch {
    return { success: false, code: "unexpected", error: "Failed to load operational settings." };
  }
}

export interface SaveOperationalHoursInput {
  organizerId: string;
  /** Whole-week hours object (same shape as the builder control). Null clears. */
  hours: unknown;
}

function applyHours(doc: ContentDoc, hours: ContentHours | null): ContentDoc {
  const next = { ...(doc as Record<string, unknown>) } as ContentDoc & Record<string, unknown>;
  if (hours === null) {
    delete next.hours;
  } else {
    next.hours = hours;
  }
  return next;
}

function sameHours(a: ContentHours | null, b: ContentHours | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Testable core of the Settings hours save: merges the hours key into the
 * live document (creating the minimal hours-only doc when no live row
 * exists) and into the existing draft row when one exists. Then READS BACK
 * the live row and refuses success unless the saved value is actually there.
 */
export async function saveOperationalHoursWithClient(
  input: SaveOperationalHoursInput,
  admin: OrderSubmitClient
): Promise<OperationalResult<{ hoursSource: "live"; hasDraftHours: boolean }>> {
  const hours = input.hours == null ? null : normalizeHours(input.hours) ?? null;
  if (input.hours != null && hours === null) {
    return { success: false, code: "validation_error", error: "Opening hours are invalid." };
  }

  try {
    const { data: website } = await admin
      .from("tenant_websites")
      .select("id")
      .eq("tenant_id", input.organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!website) {
      return { success: false, code: "not_found", error: "Create your website first to set opening hours." };
    }
    const websiteId = (website as { id: string }).id;

    const { data: liveRow } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", websiteId)
      .maybeSingle();
    const liveDoc = applyHours(
      normalizeContent(((liveRow as { content?: unknown } | null)?.content ?? {}) as Record<string, unknown>) as ContentDoc,
      hours
    );
    if (liveRow) {
      const { error } = (await admin
        .from("website_content")
        .update({ content: liveDoc })
        .eq("website_id", websiteId)) as { error: unknown };
      if (error) {
        return { success: false, code: "db_error", error: "Failed to save opening hours." };
      }
    } else {
      const { error } = (await admin
        .from("website_content")
        .insert({ website_id: websiteId, content: liveDoc })) as { error: unknown };
      if (error) {
        return { success: false, code: "db_error", error: "Failed to save opening hours." };
      }
    }

    // Merge into the existing draft only (hours key). Never create a draft:
    // publish replaces the whole live document, so a minimal hours-only
    // draft would wipe the live site. The version trigger bumps the draft
    // version, so an open builder reloads (STALE_DRAFT) instead of
    // overwriting this change on its next autosave.
    let hasDraftHours = false;
    const { data: draftRow } = await admin
      .from("website_content_drafts")
      .select("content")
      .eq("website_id", websiteId)
      .maybeSingle();
    if (draftRow) {
      const draftDoc = applyHours(
        normalizeContent(((draftRow as { content?: unknown }).content ?? {}) as Record<string, unknown>) as ContentDoc,
        hours
      );
      const { error } = (await admin
        .from("website_content_drafts")
        .update({ content: draftDoc })
        .eq("website_id", websiteId)) as { error: unknown };
      if (error) {
        return {
          success: false,
          code: "db_error",
          error: "Hours saved live, but the builder draft could not be synced. Reload the builder.",
        };
      }
      hasDraftHours = true;
    }

    // Verify-after-write: success is reported ONLY when the saved value can
    // actually be read back from the live row.
    const { data: verifyRow, error: verifyError } = await admin
      .from("website_content")
      .select("content")
      .eq("website_id", websiteId)
      .maybeSingle();
    if (verifyError || !verifyRow) {
      return {
        success: false,
        code: "db_error",
        error: "Hours could not be verified after saving. Please reload and try again.",
      };
    }
    const readBack = readHours((verifyRow as { content?: unknown }).content);
    if (!sameHours(readBack, hours)) {
      return {
        success: false,
        code: "db_error",
        error: "Hours could not be verified after saving. Please reload and try again.",
      };
    }

    return { success: true, data: { hoursSource: "live", hasDraftHours } };
  } catch {
    return { success: false, code: "unexpected", error: "Failed to save opening hours." };
  }
}

export interface SaveSiteTimezoneInput {
  organizerId: string;
  timezone: string;
}

/**
 * Testable core of the Settings time-zone save: validates the IANA zone,
 * merges metadata.timezone, then reads back to verify.
 */
export async function saveSiteTimezoneWithClient(
  input: SaveSiteTimezoneInput,
  admin: OrderSubmitClient
): Promise<OperationalResult<{ timezone: string }>> {
  const zone = typeof input.timezone === "string" ? input.timezone.trim() : "";
  if (!isValidIanaTimezone(zone)) {
    return { success: false, code: "validation_error", error: "Time zone must be a valid IANA identifier." };
  }

  try {
    const { data: website } = await admin
      .from("tenant_websites")
      .select("id, metadata")
      .eq("tenant_id", input.organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!website) {
      return { success: false, code: "not_found", error: "Create your website first to set the time zone." };
    }
    const row = website as { id: string; metadata?: unknown };
    const meta =
      row.metadata && typeof row.metadata === "object"
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    meta.timezone = zone;
    const { error } = (await admin
      .from("tenant_websites")
      .update({ metadata: meta })
      .eq("id", row.id)) as { error: unknown };
    if (error) {
      return { success: false, code: "db_error", error: "Failed to save the time zone." };
    }

    const { data: verifyRow, error: verifyError } = await admin
      .from("tenant_websites")
      .select("metadata")
      .eq("id", row.id)
      .maybeSingle();
    const stored =
      !verifyError && verifyRow && typeof (verifyRow as { metadata?: unknown }).metadata === "object"
        ? ((verifyRow as { metadata: Record<string, unknown> }).metadata.timezone as unknown)
        : null;
    if (stored !== zone) {
      return {
        success: false,
        code: "db_error",
        error: "Time zone could not be verified after saving. Please reload and try again.",
      };
    }
    return { success: true, data: { timezone: zone } };
  } catch {
    return { success: false, code: "unexpected", error: "Failed to save the time zone." };
  }
}
