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
import {
  checkPublishReadiness,
  resolveTemplateContent,
} from "@/lib/website-template-resolver";
import { getFlagshipTemplate } from "@/lib/website-template-v2";
import { generateStableId } from "@/lib/website-blocks";
import { revalidatePath } from "next/cache";

export interface ContentActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?:
    | "STALE_DRAFT"
    | "NO_DRAFT"
    | "NOT_READY"
    | "V2_ONLY"
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "not_v2"
    | "too_large"
    | "db_error"
    | "unexpected"
    | (string & {});
}

interface ResolvedWebsiteContext {
  websiteId: string;
  tenantId: string;
  websiteSlug: string;
  siteTitle: string;
  websiteStatus: string;
  metadata: Record<string, unknown>;
  userRole: EntityRole | null;
  canPublish: boolean;
}

type AuthResult =
  | { ok: true; ctx: ResolvedWebsiteContext }
  | { ok: false; error: string; code?: string };

async function resolveAndAuthorizeWebsite(
  websiteId: string,
  allowedRoles: EntityRole[]
): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, code: "unauthorized", error: "Unauthorized: Please sign in." };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: websiteRow, error: websiteErr } = await supabaseAdmin
    .from("tenant_websites")
    .select("id, tenant_id, slug, site_title, metadata, status")
    .eq("id", websiteId)
    .maybeSingle();

  if (websiteErr || !websiteRow) {
    return { ok: false, code: "not_found", error: "Website not found." };
  }

  const tenantId = websiteRow.tenant_id as string;
  const isSuperAdmin = await isAdmin();
  let userRole: EntityRole | null = null;

  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, allowedRoles);
    if (!access.hasAccess) {
      return { ok: false, code: "forbidden", error: "Forbidden: Insufficient permissions for this website." };
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
      websiteStatus: typeof websiteRow.status === "string" ? websiteRow.status : "draft",
      metadata: (websiteRow.metadata ?? {}) as Record<string, unknown>,
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
    const code = auth.code ?? "unauthorized";
    console.error(`[saveContentDraft] Auth failed for website ${websiteId}: code=${code}`);
    return { success: false, code, error: auth.error };
  }
  const ctx = auth.ctx;

  // Template-first (v2) only: the shared content store has no meaning for the
  // 6 old templates (they use per-page drafts). Ownership is resolved
  // server-side above — there is no tenant/ownership field in the payload to
  // trust or distrust.
  const saveTemplateId =
    typeof ctx.metadata.templateId === "string" ? ctx.metadata.templateId : undefined;
  if (!saveTemplateId || !getFlagshipTemplate(saveTemplateId)) {
    console.error(`[saveContentDraft] Not v2 website ${websiteId}: code=not_v2`);
    return {
      success: false,
      code: "not_v2",
      error: "Content drafts are only available for template-first (v2) websites.",
    };
  }

  const normalized = normalizeContent(content) as ContentDoc;
  let serialized: string;
  try {
    serialized = JSON.stringify(normalized);
  } catch {
    console.error(`[saveContentDraft] Serialization error for website ${ctx.websiteId}: code=unexpected`);
    return { success: false, code: "unexpected", error: "Content could not be serialized." };
  }
  if (serialized.length > MAX_CONTENT_DOC_CHARS) {
    console.error(`[saveContentDraft] Content too large for website ${ctx.websiteId}: code=too_large`);
    return { success: false, code: "too_large", error: "Content exceeds the maximum document size." };
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

    const currentVersion = typeof existing?.version === "number" ? existing.version : 0;
    if (
      typeof expectedVersion === "number" &&
      expectedVersion !== currentVersion
    ) {
      console.error(
        `[saveContentDraft] Version mismatch for website ${ctx.websiteId}: expected=${expectedVersion}, current=${currentVersion}, code=STALE_DRAFT`
      );
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
      console.error(`[saveContentDraft] Database upsert failed for website ${ctx.websiteId}: code=db_error`, upsertErr);
      return { success: false, code: "db_error", error: "Failed to save content draft. Please try again." };
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
    console.error(`[saveContentDraft] Unexpected error for website ${ctx.websiteId}: code=unexpected`, err);
    return { success: false, code: "unexpected", error: "Failed to save content draft. Please try again." };
  }
}

export interface ContentBuilderData {
  websiteId: string;
  tenantId: string;
  websiteSlug: string;
  siteTitle: string;
  websiteStatus: string;
  metadata: Record<string, unknown>;
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
        websiteStatus: ctx.websiteStatus,
        metadata: ctx.metadata,
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

  const templateId =
    typeof ctx.metadata.templateId === "string" ? ctx.metadata.templateId : undefined;
  const templateVersion =
    typeof ctx.metadata.templateVersion === "string"
      ? ctx.metadata.templateVersion
      : undefined;
  const flagship = templateId
    ? getFlagshipTemplate(templateId, templateVersion)
    : undefined;
  if (!flagship) {
    return {
      success: false,
      code: "V2_ONLY",
      error: "Publishing content drafts is only supported for valid v2 flagship template websites.",
    };
  }

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

    // The v2-only guard above makes the readiness gate mandatory here. Samples
    // remain render-only; publication materializes only real draft content.
    const { data: gateDraft } = await supabaseAdmin
      .from("website_content_drafts")
      .select("content, version")
      .eq("website_id", ctx.websiteId)
      .maybeSingle();
    // Stale writes are rejected BEFORE any page materialization, so a
    // version-mismatched publish never creates or touches page rows. The RPC
    // stays the atomic authority (a race between this check and the RPC still
    // maps 40001 to STALE_DRAFT below).
    if (
      flagship &&
      gateDraft &&
      typeof expectedVersion === "number" &&
      typeof (gateDraft as { version?: unknown }).version === "number" &&
      (gateDraft as { version: number }).version !== expectedVersion
    ) {
      return {
        success: false,
        code: "STALE_DRAFT",
        error:
          "This content was modified elsewhere. Reload to get the latest version, then publish again.",
      };
    }
    if (flagship && gateDraft) {
      const readiness = checkPublishReadiness(
        templateId as string,
        templateVersion ?? flagship.version,
        normalizeContent(gateDraft.content ?? {})
      );
      if (!readiness.ready) {
        const missing = readiness.missingRequired.map((slot) => slot.label).join(", ");
        return {
          success: false,
          code: "NOT_READY",
          error: `Not ready to publish — still missing: ${missing}.`,
        };
      }
    }

    // v2 materialization: resolve the draft into pages and make sure a
    // website_pages row exists for every emitted page (created server-side
    // before the RPC, scoped to this website; resolver "<template>--<slug>"
    // ids are internal-only — rows are matched by slug). Caller-supplied
    // pageBlocks are ignored for v2 sites: the resolver output is
    // authoritative, so emitted pages, omitted pages, and nav stay in sync.
    // Non-v2 sites keep the pass-through behavior below.
    let v2PageBlocks: PublishPageBlocksEntry[] | null = null;
    let v2SlugToId: Map<string, string> | null = null;
    let v2EmittedSlugs: Set<string> | null = null;
    let v2Resolved:
      | ReturnType<typeof resolveTemplateContent>
      | null = null;
    if (flagship && gateDraft) {
      v2Resolved = resolveTemplateContent(
        templateId as string,
        templateVersion ?? flagship.version,
        normalizeContent(gateDraft.content ?? {}),
        { includeSamples: false, includeSourceMap: false }
      );
      const homeSlug =
        v2Resolved.pages.find((page) => page.isHome)?.slug ?? "home";
      v2EmittedSlugs = new Set(v2Resolved.pages.map((page) => page.slug));

      const { data: existingPages, error: pagesErr } = await supabaseAdmin
        .from("website_pages")
        .select("id, slug, is_home, status")
        .eq("website_id", ctx.websiteId);
      if (pagesErr) {
        console.error("[publishContentDraft] Failed to load website pages:", pagesErr);
        return { success: false, error: "Failed to publish content. Please try again." };
      }
      const rows = (Array.isArray(existingPages) ? existingPages : []) as Array<{
        id: string;
        slug: string;
        is_home: boolean;
        status: string;
      }>;
      v2SlugToId = new Map(rows.map((row) => [row.slug, row.id]));

      // Exactly one home page (partial unique index
      // uq_website_pages_single_home): clear stale home flags first, then set
      // the manifest home — sequential awaits, no transient double-home.
      for (const row of rows) {
        if (row.is_home && row.slug !== homeSlug) {
          const { error: homeErr } = await supabaseAdmin
            .from("website_pages")
            .update({ is_home: false })
            .eq("id", row.id);
          if (homeErr) {
            console.error("[publishContentDraft] Failed to clear home flag:", homeErr);
            return { success: false, error: "Failed to publish content. Please try again." };
          }
        }
      }

      v2PageBlocks = [];
      for (const page of v2Resolved.pages) {
        let realId = v2SlugToId.get(page.slug);
        if (!realId) {
          realId = generateStableId();
          const { error: insertErr } = await supabaseAdmin
            .from("website_pages")
            .insert({
              id: realId,
              website_id: ctx.websiteId,
              title: page.title,
              slug: page.slug,
              is_home: page.slug === homeSlug,
              status: "draft",
              blocks: [],
              sort_order: page.sortOrder,
            });
          if (insertErr) {
            console.error("[publishContentDraft] Failed to create missing page:", insertErr);
            return { success: false, error: "Failed to publish content. Please try again." };
          }
          v2SlugToId.set(page.slug, realId);
        } else {
          const { error: updateErr } = await supabaseAdmin
            .from("website_pages")
            .update({
              title: page.title,
              sort_order: page.sortOrder,
              is_home: page.slug === homeSlug,
            })
            .eq("id", realId);
          if (updateErr) {
            console.error("[publishContentDraft] Failed to sync page row:", updateErr);
            return { success: false, error: "Failed to publish content. Please try again." };
          }
        }
        v2PageBlocks.push({ page_id: realId, blocks: page.blocks as unknown[] });
      }
    }

    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
      "publish_content_draft",
      {
        p_website_id: ctx.websiteId,
        p_expected_version:
          typeof expectedVersion === "number" ? expectedVersion : null,
        p_page_blocks: v2PageBlocks ?? pageBlocks ?? null,
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
        if (message.includes("does not belong")) {
          console.error("[publishContentDraft] Page membership failure:", rpcErr);
          return {
            success: false,
            error: "A page no longer belongs to this website. Please try publishing again.",
          };
        }
        return {
          success: false,
          code: "NO_DRAFT",
          error: "There is no content draft to publish.",
        };
      }
      console.error("[publishContentDraft] RPC failed:", rpcErr);
      return { success: false, error: "Failed to publish content. Please try again." };
    }

    // v2 finalization (service role; the 129 page guard bypasses service_role):
    // emitted pages -> published, stale/omitted rows -> draft (so removed
    // pages disappear for visitors), website -> published, nav rebuilt from
    // the resolved navigation with REAL page ids (omitted pages stay out),
    // legacy per-page drafts dropped, then revalidate site + every page path.
    // The RPC already committed the content doc at this point, so a failure
    // here reports honestly with a save-and-republish recovery path.
    if (flagship && v2Resolved && v2SlugToId && v2EmittedSlugs) {
      try {
        const slugToId: Map<string, string> = v2SlugToId;
        const emittedSlugs: Set<string> = v2EmittedSlugs;
        for (const [slug, realId] of slugToId) {
          const shouldPublish = emittedSlugs.has(slug);
          const { error: statusErr } = await supabaseAdmin
            .from("website_pages")
            .update({ status: shouldPublish ? "published" : "draft" })
            .eq("id", realId);
          if (statusErr) throw statusErr;
        }
        const { error: siteErr } = await supabaseAdmin
          .from("tenant_websites")
          .update({ status: "published" })
          .eq("id", ctx.websiteId);
        if (siteErr) throw siteErr;

        const navItems = v2Resolved.navigation.map((entry) => ({
          id: entry.id,
          label: entry.label,
          href: entry.href,
          page_id: entry.pageSlug
            ? (slugToId.get(entry.pageSlug) ?? null)
            : null,
          target: entry.target,
          order: entry.order,
        }));
        const { error: navErr } = await supabaseAdmin
          .from("website_navigation")
          .upsert(
            { website_id: ctx.websiteId, items: navItems },
            { onConflict: "website_id" }
          );
        if (navErr) throw navErr;

        for (const realId of slugToId.values()) {
          const { error: draftDeleteErr } = await supabaseAdmin
            .from("website_page_drafts")
            .delete()
            .eq("page_id", realId);
          if (draftDeleteErr) throw draftDeleteErr;
        }

        revalidatePath(`/site/${ctx.websiteSlug}`);
        for (const page of v2Resolved.pages) {
          revalidatePath(
            page.isHome ? `/site/${ctx.websiteSlug}` : `/site/${ctx.websiteSlug}/${page.slug}`
          );
        }
      } catch (finalizeErr: unknown) {
        console.error("[publishContentDraft] Post-publish finalization failed:", finalizeErr);
        return {
          success: false,
          error:
            "Content was published, but page status could not be finalized. Save the content again and republish.",
        };
      }
    } else {
      revalidatePath(`/site/${ctx.websiteSlug}`);
    }

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
