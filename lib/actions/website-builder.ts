/**
 * lib/actions/website-builder.ts
 *
 * Server Actions for the Aldriva Visual Website Builder (Phase 4 Task 4.1).
 *
 * Implements:
 *  1. savePageDraft(pageId, draftBlocks) — Saves working drafts to website_page_drafts.
 *     Permits content-write roles (owner, admin, manager, editor). Allows WIP blocks.
 *  2. publishPageDraft(pageId) — Validates all draft blocks via validateBlock().
 *     Executes single atomic publish transaction if valid. Restricted to owner, admin, manager only.
 *  3. discardPageDraft(pageId) — Clears draft from website_page_drafts.
 *  4. reorderPageBlocks(pageId, newOrder) — Reorders blocks within working draft.
 */

"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { checkTenantAccess, EntityRole, ENTITY_ROLES_ALL } from "@/lib/entity-auth";
import { validateBlock, Block, normalizeBlocks } from "@/lib/website-blocks";
import { revalidatePath } from "next/cache";

export interface WebsiteActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  issues?: unknown[];
  invalidBlockIndex?: number;
}

// ── Private Access & Entity Context Helper ────────────────────────────────────

interface ResolvedPageContext {
  pageId: string;
  websiteId: string;
  pageSlug: string;
  pageTitle: string;
  pageStatus: string;
  liveBlocks: unknown[];
  tenantId: string;
  websiteSlug: string;
}

type AuthResult =
  | { ok: true; ctx: ResolvedPageContext }
  | { ok: false; error: string };

/**
 * Resolves page and tenant context, and verifies server-side entity authorization.
 * Role check is strictly performed server-side against entity_members / organizers,
 * never from client claims.
 */
async function resolveAndAuthorizePage(
  pageId: string,
  allowedRoles: EntityRole[]
): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized: Please sign in." };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: pageRow, error: pageErr } = await supabaseAdmin
    .from("website_pages")
    .select(`
      id,
      website_id,
      slug,
      title,
      status,
      blocks,
      tenant_websites!inner (
        id,
        tenant_id,
        slug
      )
    `)
    .eq("id", pageId)
    .maybeSingle();

  if (pageErr || !pageRow) {
    return { ok: false, error: "Website page not found." };
  }

  const tw = pageRow.tenant_websites as unknown as {
    id: string;
    tenant_id: string;
    slug: string;
  };

  const tenantId = tw.tenant_id;
  const isSuperAdmin = await isAdmin();

  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, allowedRoles);
    if (!access.hasAccess) {
      return { ok: false, error: "Forbidden: Insufficient permissions for this website." };
    }
  }

  return {
    ok: true,
    ctx: {
      pageId: pageRow.id,
      websiteId: pageRow.website_id,
      pageSlug: pageRow.slug,
      pageTitle: pageRow.title,
      pageStatus: pageRow.status,
      liveBlocks: Array.isArray(pageRow.blocks) ? pageRow.blocks : [],
      tenantId,
      websiteSlug: tw.slug,
    },
  };
}

// ── Public Server Actions ─────────────────────────────────────────────────────

/**
 * Saves a working draft of blocks to website_page_drafts.
 * Authorized for content-write roles: owner, admin, manager, editor.
 *
 * Validates draftBlocks shape at a basic level (array of objects with type string),
 * but allows individually invalid blocks to be saved as drafts (WIP).
 */
export async function savePageDraft(
  pageId: string,
  draftBlocks: unknown
): Promise<WebsiteActionResult<{ blockCount: number; savedAt: string; version: number }>> {
  const auth = await resolveAndAuthorizePage(pageId, [
    "owner",
    "admin",
    "manager",
    "editor",
  ]);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const ctx = auth.ctx;

  if (!Array.isArray(draftBlocks)) {
    return {
      success: false,
      error: "Draft blocks must be an array.",
    };
  }

  // Normalize blocks to ensure stable ids for enrollment before persistence (Stage B backward compatibility)
  const normalizedDraftBlocks = normalizeBlocks(draftBlocks as Block[]);

  for (let i = 0; i < normalizedDraftBlocks.length; i++) {
    const b = normalizedDraftBlocks[i];
    if (
      !b ||
      typeof b !== "object" ||
      typeof (b as unknown as Record<string, unknown>).type !== "string" ||
      !(b as unknown as Record<string, unknown>).type
    ) {
      return {
        success: false,
        error: `Invalid block at index ${i}: Block must be an object with a 'type' property.`,
        invalidBlockIndex: i,
      };
    }
  }

  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: upsertData, error: upsertErr } = await supabaseAdmin
      .from("website_page_drafts")
      .upsert(
        {
          page_id: ctx.pageId,
          blocks: normalizedDraftBlocks,
          updated_by: user?.id || null,
          updated_at: now,
        },
        { onConflict: "page_id" }
      )
      .select("version, updated_at")
      .maybeSingle();

    if (upsertErr) {
      console.error("[savePageDraft] Database upsert failed:", upsertErr);
      return {
        success: false,
        error: "Failed to save page draft. Please try again.",
      };
    }

    return {
      success: true,
      data: {
        blockCount: normalizedDraftBlocks.length,
        savedAt: upsertData?.updated_at || now,
        version: typeof upsertData?.version === "number" ? upsertData.version : 1,
      },
    };
  } catch (err: unknown) {
    console.error("[savePageDraft] Unexpected error:", err);
    return {
      success: false,
      error: "Failed to save page draft. Please try again.",
    };
  }
}

export interface PageBuilderData {
  pageId: string;
  websiteId: string;
  pageSlug: string;
  pageTitle: string;
  pageStatus: string;
  tenantId: string;
  websiteSlug: string;
  liveBlocks: Block[];
  draftBlocks: Block[] | null;
  blocks: Block[];
  hasDraft: boolean;
  version: number;
  lastSavedAt: string | null;
  canPublish: boolean;
  userRole: EntityRole | "super_admin";
}

/**
 * Fetches page builder initial data including live blocks, draft blocks (if any),
 * draft version, and user publishing permissions.
 */
export async function getPageBuilderData(
  pageId: string
): Promise<WebsiteActionResult<PageBuilderData>> {
  const auth = await resolveAndAuthorizePage(pageId, [
    "owner",
    "admin",
    "manager",
    "editor",
  ]);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const ctx = auth.ctx;
  const user = await getCurrentUser();
  const isSuperAdmin = await isAdmin();

  let userRole: EntityRole | "super_admin" = "editor";
  if (isSuperAdmin) {
    userRole = "super_admin";
  } else if (user) {
    const access = await checkTenantAccess(user.id, ctx.tenantId, ENTITY_ROLES_ALL);
    if (access.role) {
      userRole = access.role;
    }
  }

  const canPublish = isSuperAdmin || ["owner", "admin", "manager"].includes(userRole);

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { data: draftRow } = await supabaseAdmin
      .from("website_page_drafts")
      .select("blocks, version, updated_at")
      .eq("page_id", ctx.pageId)
      .maybeSingle();

    const liveBlocks = Array.isArray(ctx.liveBlocks) ? normalizeBlocks(ctx.liveBlocks as Block[]) : [];
    const draftBlocks =
      draftRow?.blocks && Array.isArray(draftRow.blocks)
        ? normalizeBlocks(draftRow.blocks as Block[])
        : null;
    const hasDraft = draftBlocks !== null;
    const currentBlocks = hasDraft ? draftBlocks : liveBlocks;
    const version = typeof draftRow?.version === "number" ? draftRow.version : 0;
    const lastSavedAt = draftRow?.updated_at || null;

    return {
      success: true,
      data: {
        pageId: ctx.pageId,
        websiteId: ctx.websiteId,
        pageSlug: ctx.pageSlug,
        pageTitle: ctx.pageTitle,
        pageStatus: ctx.pageStatus,
        tenantId: ctx.tenantId,
        websiteSlug: ctx.websiteSlug,
        liveBlocks,
        draftBlocks,
        blocks: currentBlocks,
        hasDraft,
        version,
        lastSavedAt,
        canPublish,
        userRole,
      },
    };
  } catch (err: unknown) {
    console.error("[getPageBuilderData] Unexpected error:", err);
    return {
      success: false,
      error: "Failed to load page builder data. Please try again.",
    };
  }
}

/**
 * Validates all blocks in website_page_drafts through validateBlock() from lib/website-blocks.ts.
 * If ANY block fails validation, rejects the entire publish operation with a descriptive error
 * and leaves the database untouched.
 *
 * If all blocks pass validation, executes the atomic publish (copying draft to live blocks,
 * setting status='published', and clearing working draft).
 *
 * Authorized for publishing roles only: owner, admin, manager.
 * Editors MUST be rejected.
 */
export async function publishPageDraft(
  pageId: string
): Promise<WebsiteActionResult<{ status: string; publishedAt: string }>> {
  // 1. Strict Role Authorization: Editors are rejected
  const auth = await resolveAndAuthorizePage(pageId, [
    "owner",
    "admin",
    "manager",
  ]);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const ctx = auth.ctx;
  const supabaseAdmin = createSupabaseAdmin();

  // 2. Fetch working draft
  const { data: draftRow, error: draftErr } = await supabaseAdmin
    .from("website_page_drafts")
    .select("blocks, version, updated_by")
    .eq("page_id", ctx.pageId)
    .maybeSingle();

  if (
    draftErr ||
    !draftRow ||
    !Array.isArray(draftRow.blocks) ||
    typeof draftRow.version !== "number"
  ) {
    return {
      success: false,
      error: "No working draft found for this page. Save a draft before publishing.",
    };
  }

  const rawBlocks = draftRow.blocks;
  const validatedBlocks: Block[] = [];

  // 3. Complete Schema & Security Validation for every single block
  for (let i = 0; i < rawBlocks.length; i++) {
    const res = validateBlock(rawBlocks[i]);
    if (!res.success) {
      const blockType =
        typeof (rawBlocks[i] as Record<string, unknown>)?.type === "string"
          ? (rawBlocks[i] as Record<string, unknown>).type
          : "unknown";

      return {
        success: false,
        error: `Publish rejected: Block #${i + 1} (${blockType}) failed validation: ${res.error || "Invalid block structure."}`,
        issues: res.issues,
        invalidBlockIndex: i,
      };
    }
    validatedBlocks.push(res.data!);
  }

  try {
    // 4. Atomic Publish: execute publish_page_draft RPC with guaranteed numeric version
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
      "publish_page_draft",
      {
        p_page_id: ctx.pageId,
        p_expected_version: draftRow.version,
      }
    );

    if (rpcErr) {
      if (
        rpcErr.message?.includes("version mismatch") ||
        (rpcErr as { code?: string })?.code === "40001"
      ) {
        return {
          success: false,
          error:
            "Draft was modified concurrently while publishing. Please review the updated draft and publish again.",
        };
      }

      console.error("[publishPageDraft] RPC execution failed:", rpcErr);
      return {
        success: false,
        error: "Failed to publish page. Please try again.",
      };
    }

    // 5. Invalidate caches
    if (ctx.websiteSlug) {
      revalidatePath(`/site/${ctx.websiteSlug}`, "layout");
      revalidatePath(`/site/${ctx.websiteSlug}/${ctx.pageSlug}`);
    }

    return {
      success: true,
      data: {
        status: "published",
        publishedAt:
          (rpcRes as { published_at?: string })?.published_at ||
          new Date().toISOString(),
      },
    };
  } catch (err: unknown) {
    console.error("[publishPageDraft] Unexpected error:", err);
    return {
      success: false,
      error: "Failed to publish page. Please try again.",
    };
  }
}

/**
 * Discards the working draft in website_page_drafts, leaving live blocks/status untouched.
 * Authorized for content-write roles: owner, admin, manager, editor.
 */
export async function discardPageDraft(
  pageId: string
): Promise<WebsiteActionResult<{ discardedAt: string }>> {
  const auth = await resolveAndAuthorizePage(pageId, [
    "owner",
    "admin",
    "manager",
    "editor",
  ]);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const ctx = auth.ctx;

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { error: deleteErr } = await supabaseAdmin
      .from("website_page_drafts")
      .delete()
      .eq("page_id", ctx.pageId);

    if (deleteErr) {
      console.error("[discardPageDraft] Delete failed:", deleteErr);
      return {
        success: false,
        error: "Failed to discard page draft. Please try again.",
      };
    }

    return {
      success: true,
      data: {
        discardedAt: new Date().toISOString(),
      },
    };
  } catch (err: unknown) {
    console.error("[discardPageDraft] Unexpected error:", err);
    return {
      success: false,
      error: "Failed to discard page draft. Please try again.",
    };
  }
}

/**
 * Reorders blocks within the working draft in website_page_drafts.
 * Leaves live website_pages.blocks untouched (reordering is a draft-time operation).
 *
 * Accepts an array of block index numbers, block IDs, or reordered block objects.
 * Authorized for content-write roles: owner, admin, manager, editor.
 */
export async function reorderPageBlocks(
  pageId: string,
  newOrder: number[] | string[] | Record<string, unknown>[]
): Promise<WebsiteActionResult<{ blockCount: number; blocks: unknown[] }>> {
  const auth = await resolveAndAuthorizePage(pageId, [
    "owner",
    "admin",
    "manager",
    "editor",
  ]);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const ctx = auth.ctx;

  if (!Array.isArray(newOrder)) {
    return {
      success: false,
      error: "newOrder must be an array.",
    };
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // 1. Fetch current draft (or fallback to live blocks if no draft yet)
    const { data: draftRow } = await supabaseAdmin
      .from("website_page_drafts")
      .select("blocks")
      .eq("page_id", ctx.pageId)
      .maybeSingle();

    let currentBlocks: unknown[] = [];
    if (draftRow?.blocks && Array.isArray(draftRow.blocks)) {
      currentBlocks = draftRow.blocks;
    } else {
      currentBlocks = ctx.liveBlocks;
    }

    let reordered: unknown[] = [];

    // Case A: newOrder is an array of objects (direct reordered block array)
    if (
      newOrder.length > 0 &&
      typeof newOrder[0] === "object" &&
      newOrder[0] !== null
    ) {
      reordered = newOrder;
    }
    // Case B: newOrder is an array of numerical indices (e.g. [2, 0, 1])
    else if (newOrder.length > 0 && typeof newOrder[0] === "number") {
      const indices = newOrder as number[];
      reordered = indices
        .map((idx) => currentBlocks[idx])
        .filter((b) => b !== undefined);
    }
    // Case C: newOrder is an array of block ID strings
    else if (newOrder.length > 0 && typeof newOrder[0] === "string") {
      const idOrder = newOrder as string[];
      const blockMap = new Map<string, unknown>();
      currentBlocks.forEach((b, idx) => {
        const id = (b as { id?: string })?.id || String(idx);
        blockMap.set(id, b);
      });
      reordered = idOrder
        .map((id) => blockMap.get(id))
        .filter((b) => b !== undefined);
    }

    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const now = new Date().toISOString();

    const { error: upsertErr } = await supabaseAdmin
      .from("website_page_drafts")
      .upsert(
        {
          page_id: ctx.pageId,
          blocks: reordered,
          updated_by: user?.id || null,
          updated_at: now,
        },
        { onConflict: "page_id" }
      );

    if (upsertErr) {
      console.error("[reorderPageBlocks] Upsert failed:", upsertErr);
      return {
        success: false,
        error: "Failed to save reordered page blocks. Please try again.",
      };
    }

    return {
      success: true,
      data: {
        blockCount: reordered.length,
        blocks: reordered,
      },
    };
  } catch (err: unknown) {
    console.error("[reorderPageBlocks] Unexpected error:", err);
    return {
      success: false,
      error: "Failed to save reordered page blocks. Please try again.",
    };
  }
}

export interface BuilderEmbedOptions {
  events: Array<{
    id: string;
    title: string;
    organizer_id: string;
    status?: string;
    start_date?: string;
  }>;
  products: Array<{
    id: string;
    title: string;
    tenant_id: string;
    organizer_id: string;
    status?: string;
    price_cents?: number;
  }>;
  fundraisers: Array<{
    id: string;
    title: string;
    organizer_id: string;
    status?: string;
    current_amount?: number;
    goal_amount?: number;
  }>;
}

/**
 * Fetches tenant-scoped embed options (events, products, fundraisers) for builder pickers.
 * Scoped strictly server-side by organizer_id = tenantId.
 */
export async function getBuilderEmbedOptions(
  tenantId: string
): Promise<WebsiteActionResult<BuilderEmbedOptions>> {
  if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
    return { success: false, error: "Invalid tenant ID." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  const isSuperAdmin = await isAdmin();
  const supabaseAdmin = createSupabaseAdmin();

  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, [
      "owner",
      "admin",
      "manager",
      "editor",
    ]);

    if (!access.hasAccess) {
      return {
        success: false,
        error: "Forbidden: Insufficient permissions for this organization.",
      };
    }
  }

  try {
    // 1. Tenant-scoped Events
    const { data: eventsData } = await supabaseAdmin
      .from("events")
      .select("id, title, organizer_id, status, start_date")
      .eq("organizer_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    // 2. Tenant-scoped Products (two-step join via businesses linked to tenant, no owner_id fallback)
    const { data: businesses } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("organizer_id", tenantId);

    const businessIds = (businesses || []).map((b) => b.id);
    let productsList: BuilderEmbedOptions["products"] = [];

    if (businessIds.length > 0) {
      const { data: productsData } = await supabaseAdmin
        .from("products")
        .select("id, title, business_id, status, price_cents")
        .in("business_id", businessIds)
        .order("created_at", { ascending: false })
        .limit(50);

      productsList = (productsData || []).map((p) => ({
        id: p.id,
        title: p.title,
        tenant_id: tenantId,
        organizer_id: tenantId,
        status: p.status,
        price_cents: p.price_cents,
      }));
    }

    // 3. Tenant-scoped Fundraisers (excluding soft-deleted)
    const { data: fundraisersData } = await supabaseAdmin
      .from("fundraisers")
      .select("id, title, organizer_id, status, current_amount, goal_amount")
      .eq("organizer_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      success: true,
      data: {
        events: (eventsData || []).map((e) => ({
          id: e.id,
          title: e.title,
          organizer_id: e.organizer_id,
          status: e.status,
          start_date: e.start_date,
        })),
        products: productsList,
        fundraisers: (fundraisersData || []).map((f) => ({
          id: f.id,
          title: f.title,
          organizer_id: f.organizer_id,
          status: f.status,
          current_amount: f.current_amount,
          goal_amount: f.goal_amount,
        })),
      },
    };
  } catch (err: unknown) {
    console.error("[getBuilderEmbedOptions] Unexpected error:", err);
    return {
      success: false,
      error: "Failed to load embed options. Please try again.",
    };
  }
}
