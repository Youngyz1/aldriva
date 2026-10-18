/**
 * lib/actions/website-template-switch.ts
 *
 * Change an existing site to another non-legacy template (owner rule:
 * category never matters). Draft-only: metadata swaps templateId/version
 * (+ accent default rule); owner content is never deleted, published pages
 * and live status are untouched until the owner publishes.
 */

"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  checkTenantAccess,
  ENTITY_ROLES_CONTENT_WRITE,
  type EntityRole,
} from "@/lib/entity-auth";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import {
  canEditWebsiteTemplate,
  getTemplateSwitchTargets,
  isSwitchTargetAllowed,
  resolveSwitchedAccent,
  summarizeTemplateSwitch,
  type TemplateSwitchSummary,
  type TemplateSwitchTarget,
} from "@/lib/website-template-switch";
import type { ContentActionResult } from "@/lib/actions/website-content";
import type { ContentDoc } from "@/lib/website-content";

async function authorizeWebsite(
  websiteId: string
): Promise<
  | { ok: true; websiteId: string; tenantId: string; metadata: Record<string, unknown>; userRole: EntityRole | null }
  | { ok: false; error: string; code: string }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized: Please sign in.", code: "unauthorized" };
  }
  const key = typeof websiteId === "string" ? websiteId.trim() : "";
  if (!key) {
    return { ok: false, error: "Website ID is required.", code: "not_found" };
  }
  const supabaseAdmin = createSupabaseAdmin();
  const { data: websiteRow, error: websiteErr } = await supabaseAdmin
    .from("tenant_websites")
    .select("id, tenant_id, metadata")
    .eq("id", key)
    .maybeSingle();
  if (websiteErr || !websiteRow) {
    return { ok: false, error: "Website not found.", code: "not_found" };
  }
  const tenantId = websiteRow.tenant_id as string;
  // Platform superadmins bypass membership (same family as website-v2 create
  // and the content resolver); everyone else needs a content-write role.
  // The shared canEditWebsiteTemplate predicate is the documented rule.
  let userRole: EntityRole | null = null;
  const isSuperAdmin = await isAdmin();
  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, [...ENTITY_ROLES_CONTENT_WRITE]);
    if (!access.hasAccess || !canEditWebsiteTemplate(access.role)) {
      return { ok: false, error: "Only editors can change the template.", code: "forbidden" };
    }
    userRole = access.role;
  }
  const metadata =
    websiteRow.metadata && typeof websiteRow.metadata === "object" && !Array.isArray(websiteRow.metadata)
      ? (websiteRow.metadata as Record<string, unknown>)
      : {};
  return {
    ok: true,
    websiteId: websiteRow.id as string,
    tenantId,
    metadata,
    userRole,
  };
}

/**
 * Read-only switch preview for the confirm dialog: plan summary for the
 * latest saved draft (or live content when no draft exists yet).
 */
export async function previewTemplateSwitch(
  websiteId: string,
  newTemplateId: string
): Promise<ContentActionResult<{ targets: TemplateSwitchTarget[]; summary: TemplateSwitchSummary }>> {
  const auth = await authorizeWebsite(websiteId);
  if (!auth.ok) return { success: false, error: auth.error, code: auth.code };

  const target = (newTemplateId ?? "").trim();
  if (!isSwitchTargetAllowed(target)) {
    return { success: false, error: "That template is not available for switching.", code: "unknown_template" };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const [{ data: draftRow }, { data: liveRow }] = await Promise.all([
    supabaseAdmin.from("website_content_drafts").select("content").eq("website_id", auth.websiteId).maybeSingle(),
    supabaseAdmin.from("website_content").select("content").eq("website_id", auth.websiteId).maybeSingle(),
  ]);
  const doc = (draftRow?.content ?? liveRow?.content ?? {}) as ContentDoc;
  const currentTemplateId =
    typeof auth.metadata.templateId === "string" ? (auth.metadata.templateId as string) : null;
  const currentLocale = await getLocale();
  const locale = currentLocale === "fr" ? "fr" : "en";
  return {
    success: true,
    data: {
      targets: getTemplateSwitchTargets(currentTemplateId, locale),
      summary: summarizeTemplateSwitch(currentTemplateId, target, doc),
    },
  };
}

/**
 * Swaps the site template in metadata + applies the accent default rule.
 * Concurrency: expectedVersion must match the stored draft version (0 when
 * no draft row exists); a mismatch returns STALE_DRAFT and writes nothing.
 * Content, pages, navigation, status, timezone, and storefront settings are
 * never touched here — the live site changes only on the next publish.
 */
export async function switchWebsiteTemplate(
  websiteId: string,
  newTemplateId: string,
  expectedVersion?: number | null
): Promise<ContentActionResult<{ templateId: string; templateVersion: string; draftVersion: number }>> {
  const auth = await authorizeWebsite(websiteId);
  if (!auth.ok) return { success: false, error: auth.error, code: auth.code };

  const target = (newTemplateId ?? "").trim();
  const next = getFlagshipTemplate(target);
  if (!next || next.legacy) {
    return { success: false, error: "That template is not available for switching.", code: "unknown_template" };
  }
  const currentTemplateId =
    typeof auth.metadata.templateId === "string" ? (auth.metadata.templateId as string) : null;
  if (currentTemplateId === next.id) {
    return { success: false, error: "This site already uses that template.", code: "already_current" };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: draftRow, error: versionErr } = await supabaseAdmin
    .from("website_content_drafts")
    .select("version")
    .eq("website_id", auth.websiteId)
    .maybeSingle();
  if (versionErr) {
    return { success: false, error: "Could not switch template. Please try again.", code: "db_error" };
  }
  const currentVersion = typeof draftRow?.version === "number" ? draftRow.version : 0;
  if (typeof expectedVersion === "number" && expectedVersion !== currentVersion) {
    return {
      success: false,
      code: "STALE_DRAFT",
      error: "This site changed in another tab. Reload to get the latest version, then switch again.",
    };
  }

  const currentBrand =
    auth.metadata.brand && typeof auth.metadata.brand === "object" && !Array.isArray(auth.metadata.brand)
      ? (auth.metadata.brand as Record<string, unknown>)
      : {};
  const nextMetadata: Record<string, unknown> = {
    ...auth.metadata,
    templateId: next.id,
    templateVersion: next.version,
    brand: {
      ...currentBrand,
      accentId: resolveSwitchedAccent(
        typeof currentBrand.accentId === "string" ? currentBrand.accentId : null,
        next
      ),
    },
  };

  const { error: metadataErr } = await supabaseAdmin
    .from("tenant_websites")
    .update({ metadata: nextMetadata })
    .eq("id", auth.websiteId);
  if (metadataErr) {
    return { success: false, error: "Could not switch template. Please try again.", code: "db_error" };
  }

  revalidatePath(`/dashboard/org/${auth.tenantId}/website/builder`);
  return {
    success: true,
    data: { templateId: next.id, templateVersion: next.version, draftVersion: currentVersion },
  };
}
