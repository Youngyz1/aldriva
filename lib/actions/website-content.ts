/**
 * lib/actions/website-content.ts
 *
 * Server actions for the template-first shared content store (Stage S2).
 *
 * One JSONB document per website (website_content / website_content_drafts,
 * migration_168). Template slots resolve field keys from this document.
 *
 * Auth uses ONE helper consistently: checkTenantAccess() from
 * lib/entity-auth.ts (plus the isAdmin() super-admin bypass, same as
 * lib/actions/website-builder.ts). Tenant/website ownership is resolved
 * server-side from websiteId via the service-role client — never from the
 * client payload.
 */

"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  checkTenantAccess,
  EntityRole,
  ENTITY_ROLES_CONTENT_WRITE,
  ENTITY_ROLES_MANAGE,
} from "@/lib/entity-auth";
import {
  normalizeContent,
  MAX_CONTENT_DOC_CHARS,
  type ContentDoc,
} from "@/lib/website-content";
import { revalidatePath } from "next/cache";

export interface ContentActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** Machine-readable stale-write signal (409-style); clients should reload. */
  code?: "STALE_DRAFT" | "NO_DRAFT";
}

interface ResolvedWebsiteContext {
  websiteId: string;
  tenantId: string;
  websiteSlug: string;
  siteTitle: string;
  userRole: EntityRole | null;
  canPublish: boolean;
}

type AuthResult =
  | { ok: true; ctx: ResolvedWebsiteContext }
  | { ok: false; error: string };

async function resolveAndAuthorizeWebsite(
  websiteId: string,
  allowedRoles: EntityRole[]
): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized: Please sign in." };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: websiteRow, error: websiteErr } = await supabaseAdmin
    .from("tenant_websites")
    .select("id, tenant_id, slug, site_title")
    .eq("id", websiteId)
    .maybeSingle();

  if (websiteErr || !websiteRow) {
    return { ok: false, error: "Website not found." };
  }

  const tenantId = websiteRow.tenant_id as string;
  const isSuperAdmin = await isAdmin();
  let userRole: EntityRole | null = null;

  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, allowedRoles);
    if (!access.hasAccess) {
      return { ok: false, error: "Forbidden: Insufficient permissions for this website." };
    }
    userRole = access.role;
  }

  const canPublish =
    isSuperAdmin ||
    userRole === null ||
    (ENTITY_ROLES_MANAGE as readonly string[]).includes(userRole);

  return {
    ok: true,
    ctx: {
      websiteId: websiteRow.id as string,
      tenantId,
      websiteSlug: websiteRow.slug as string,
      siteTitle: websiteRow.site_title as string,
      userRole,
      canPublish,
    },
  };
}

/**
 * Saves a working content draft (version-checked).
 * Authorized for content-write roles: owner, admin, manager, editor.
 *
 * expectedVersion: when provided, the write is rejected with code STALE_DRAFT
 * if the stored draft version differs (409-style; client should reload).
 * Omitted expectedVersion = blind overwrite (kept for single-session flows).
 */
export async function saveContentDraft(
  websiteId: string,
  content: unknown,
  expectedVersion?: number | null
): Promise<
  ContentActionResult<{ savedAt: string; version: number; hasDraft: boolean }>
> {
  const auth = await resolveAndAuthorizeWebsite(websiteId, [
    ...ENTITY_ROLES_CONTENT_WRITE,
  ]);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const ctx = auth.ctx;

  const normalized = normalizeContent(content) as ContentDoc;
  let serialized: string;
  try {
    serialized = JSON.stringify(normalized);
  } catch {
    return { success: false, error: "Content could not be serialized." };
  }
  if (serialized.length > MAX_CONTENT_DOC_CHARS) {
    return { success: false, error: "Content exceeds the maximum document size." };
  }

  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("website_content_drafts")
      .select("version")
      .eq("website_id", ctx.websiteId)
      .maybeSingle();

    if (
      typeof expectedVersion === "number" &&
      existing &&
      typeof existing.version === "number" &&
      existing.version !== expectedVersion
    ) {
      return {
        success: false,
        code: "STALE_DRAFT",
        error:
          "This content was modified elsewhere. Reload to get the latest version, then save again.",
      };
    }

    const { data: upsertData, error: upsertErr } = await supabaseAdmin
      .from("website_content_drafts")
      .upsert(
        {
          website_id: ctx.websiteId,
          content: normalized,
          updated_by: user?.id || null,
          updated_at: now,
        },
        { onConflict: "website_id" }
      )
      .select("version, updated_at")
      .maybeSingle();

    if (upsertErr) {
      console.error("[saveContentDraft] Database upsert failed:", upsertErr);
      return { success: false, error: "Failed to save content draft. Please try again." };
    }

    return {
      success: true,
      data: {
        savedAt: upsertData?.updated_at || now,
        version: typeof upsertData?.version === "number" ? upsertData.version : 1,
        hasDraft: true,
      },
    };
  } catch (err: unknown) {
    console.error("[saveContentDraft] Unexpected error:", err);
    return { success: false, error: "Failed to save content draft. Please try again." };
  }
}

export interface ContentBuilderData {
  websiteId: string;
  tenantId: string;
  websiteSlug: string;
  siteTitle: string;
  liveContent: ContentDoc;
  draftContent: ContentDoc | null;
  content: ContentDoc;
  version: number;
  hasDraft: boolean;
  userRole: EntityRole | null;
  canPublish: boolean;
}

/**
 * Loads live + draft content for the builder.
 * Read access: all 6 entity roles (viewers/finance can open read-only).
 */
export async function getContentForBuilder(
  websiteId: string
): Promise<ContentActionResult<ContentBuilderData>> {
  const auth = await resolveAndAuthorizeWebsite(websiteId, [
    "owner",
    "admin",
    "manager",
    "editor",
    "finance",
    "viewer",
  ]);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const ctx = auth.ctx;

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const [{ data: liveRow }, { data: draftRow }] = await Promise.all([
      supabaseAdmin
        .from("website_content")
        .select("content")
        .eq("website_id", ctx.websiteId)
        .maybeSingle(),
      supabaseAdmin
        .from("website_content_drafts")
        .select("content, version, updated_at")
        .eq("website_id", ctx.websiteId)
        .maybeSingle(),
    ]);

    const liveContent = normalizeContent(liveRow?.content ?? {});
    const draftContent = draftRow ? normalizeContent(draftRow.content ?? {}) : null;

    return {
      success: true,
      data: {
        websiteId: ctx.websiteId,
        tenantId: ctx.tenantId,
        websiteSlug: ctx.websiteSlug,
        siteTitle: ctx.siteTitle,
        liveContent,
        draftContent,
        content: draftContent ?? liveContent,
        version: typeof draftRow?.version === "number" ? draftRow.version : 0,
        hasDraft: draftRow !== null,
        userRole: ctx.userRole,
        canPublish: ctx.canPublish,
      },
    };
  } catch (err: unknown) {
    console.error("[getContentForBuilder] Unexpected error:", err);
    return { success: false, error: "Failed to load website content. Please try again." };
  }
}

export interface PublishPageBlocksEntry {
  page_id: string;
  blocks: unknown[];
}

/**
 * Publishes the content draft via the atomic publish_content_draft RPC.
 * Restricted to owner, admin, manager only (editors rejected — same rule as
 * publishPageDraft). expectedVersion maps RPC 40001 to code STALE_DRAFT.
 *
 * pageBlocks: optional resolver-generated [{page_id, blocks}] entries written
 * in the same transaction (RPC verifies each page belongs to this website).
 */
export async function publishContentDraft(
  websiteId: string,
  expectedVersion?: number | null,
  pageBlocks?: PublishPageBlocksEntry[] | null
): Promise<ContentActionResult<{ version: number; pagesWritten: number }>> {
  const auth = await resolveAndAuthorizeWebsite(websiteId, [
    ...ENTITY_ROLES_MANAGE,
  ]);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const ctx = auth.ctx;

  if (pageBlocks !== undefined && pageBlocks !== null) {
    if (!Array.isArray(pageBlocks)) {
      return { success: false, error: "pageBlocks must be an array." };
    }
    for (const entry of pageBlocks) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof (entry as { page_id?: unknown }).page_id !== "string" ||
        !Array.isArray((entry as { blocks?: unknown }).blocks)
      ) {
        return {
          success: false,
          error: "Each pageBlocks entry must be {page_id: string, blocks: array}.",
        };
      }
    }
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
      "publish_content_draft",
      {
        p_website_id: ctx.websiteId,
        p_expected_version:
          typeof expectedVersion === "number" ? expectedVersion : null,
        p_page_blocks: pageBlocks ?? null,
      }
    );

    if (rpcErr) {
      const message = rpcErr.message || "";
      const code = (rpcErr as { code?: string }).code || "";
      if (code === "40001" || message.includes("version mismatch")) {
        return {
          success: false,
          code: "STALE_DRAFT",
          error:
            "This content was modified elsewhere. Reload to get the latest version, then publish again.",
        };
      }
      if (code === "P0002" || message.includes("No content draft")) {
        return {
          success: false,
          code: "NO_DRAFT",
          error: "There is no content draft to publish.",
        };
      }
      console.error("[publishContentDraft] RPC failed:", rpcErr);
      return { success: false, error: "Failed to publish content. Please try again." };
    }

    revalidatePath(`/site/${ctx.websiteSlug}`);

    const res = rpcRes as { version?: number; pages_written?: number } | null;
    return {
      success: true,
      data: {
        version: typeof res?.version === "number" ? res.version : 0,
        pagesWritten: typeof res?.pages_written === "number" ? res.pages_written : 0,
      },
    };
  } catch (err: unknown) {
    console.error("[publishContentDraft] Unexpected error:", err);
    return { success: false, error: "Failed to publish content. Please try again." };
  }
}

/**
 * Discards the content draft; live content is untouched.
 * Authorized for content-write roles (owner, admin, manager, editor) —
 * same rule as discardPageDraft.
 */
export async function discardContentDraft(
  websiteId: string
): Promise<ContentActionResult<{ discarded: boolean }>> {
  const auth = await resolveAndAuthorizeWebsite(websiteId, [
    ...ENTITY_ROLES_CONTENT_WRITE,
  ]);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const ctx = auth.ctx;

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { error: deleteErr } = await supabaseAdmin
      .from("website_content_drafts")
      .delete()
      .eq("website_id", ctx.websiteId);

    if (deleteErr) {
      console.error("[discardContentDraft] Database delete failed:", deleteErr);
      return { success: false, error: "Failed to discard content draft. Please try again." };
    }

    return { success: true, data: { discarded: true } };
  } catch (err: unknown) {
    console.error("[discardContentDraft] Unexpected error:", err);
    return { success: false, error: "Failed to discard content draft. Please try again." };
  }
}
