/**
 * lib/actions/website-v2.ts
 *
 * Server actions for template-first (v2 flagship) websites (Stage 4A).
 * Server side only — no editor UI here.
 *
 * - createWebsiteFromV2Template: owner/admin/manager only (same
 *   checkTenantAccess + isAdmin bypass family as lib/actions/website-content.ts;
 *   ids from the client are verified server-side, never trusted). Validates the
 *   template id against the v2 flagship registry, checks organizer-category
 *   compatibility, builds the initial content doc from the organizer through
 *   the hydration allowlist, resolves pages + navigation with the pure
 *   resolver, and persists website + pages + nav atomically through the
 *   existing create_website_from_template RPC (migration 131, reused as-is —
 *   no migration). The first content draft and legacy page-draft cleanup
 *   happen as idempotent follow-up steps (the RPC knows nothing about the
 *   content store). Initial site status stays "draft".
 * - getBuilderState: builder snapshot (template, draft-or-live content,
 *   version, readiness, role) plus resolved preview pages. Preview blocks
 *   merge samples render-only and are never persisted.
 */

"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  checkTenantAccess,
  ENTITY_ROLES_MANAGE,
  type EntityRole,
} from "@/lib/entity-auth";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import {
  normalizeWebsiteCategory,
  isTemplateCompatibleWithCategory,
  mapOrgTypeToWebsiteCategory,
  type WebsiteCategory,
} from "@/lib/website-category";
import {
  getFlagshipTemplate,
  type WebsiteTemplateV2,
} from "@/lib/website-template-v2";
import {
  normalizeContent,
  type ContentDoc,
} from "@/lib/website-content";
import {
  resolveTemplateContent,
  checkPublishReadiness,
  type ResolvedPage,
  type OmittedPage,
  type SkippedSection,
  type PublishReadiness,
} from "@/lib/website-template-resolver";
import { generateStableId } from "@/lib/website-blocks";
import { isReservedWebsiteSlug } from "@/lib/website-nav";
import {
  getContentForBuilder,
  type ContentActionResult,
} from "@/lib/actions/website-content";

export interface CreateV2WebsiteOptions {
  siteTitle?: string;
  slug?: string;
  websiteCategory?: string;
  creationRequestId?: string;
}

export interface CreateV2WebsiteResult {
  success: boolean;
  data?: { websiteId: string; slug: string; idempotent?: boolean };
  error?: string;
}

interface OrganizerRow {
  id: string;
  name: string;
  slug: string;
  bio?: string | null;
  photo?: string | null;
  website?: string | null;
  contact_email?: string | null;
  org_type?: string | null;
}

/**
 * Builds the initial content doc from the organizer row, restricted to the
 * existing hydration allowlist (lib/website-hydration.ts
 * ALLOWED_HYDRATION_FIELDS): name -> business_name, bio -> about_text,
 * photo -> logo_url, contact_email -> email. organizers has no phone/address
 * columns (those live on businesses), so those slots start empty and the
 * readiness gate blocks publish until the owner fills them. normalizeContent
 * drops everything else, so no sample keys can ever enter here.
 */
export function buildInitialContentFromOrganizer(
  organizer: OrganizerRow
): ContentDoc {
  return normalizeContent({
    business_name: organizer.name,
    ...(organizer.bio ? { about_text: organizer.bio } : {}),
    ...(organizer.photo ? { logo_url: organizer.photo } : {}),
    ...(organizer.contact_email ? { email: organizer.contact_email } : {}),
  });
}

export async function createWebsiteFromV2Template(
  tenantId: string,
  templateId: string,
  options?: CreateV2WebsiteOptions
): Promise<CreateV2WebsiteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  const tenant = (tenantId ?? "").trim();
  if (!tenant) {
    return { success: false, error: "Organizer ID is required." };
  }

  // Same auth family as the content actions: platform-admin bypass, otherwise
  // owner/admin/manager membership verified server-side.
  const isSuperAdmin = await isAdmin();
  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenant, [
      ...ENTITY_ROLES_MANAGE,
    ]);
    if (!access.hasAccess) {
      return { success: false, error: "Forbidden: insufficient entity permissions" };
    }
  }

  const template: WebsiteTemplateV2 | undefined = getFlagshipTemplate(
    (templateId ?? "").trim()
  );
  if (!template) {
    return {
      success: false,
      error: `Invalid template: ${templateId} is not a template-first (v2) flagship template.`,
    };
  }

  const supabaseAdmin = createSupabaseAdmin();

  const { data: organizer, error: orgError } = await supabaseAdmin
    .from("organizers")
    .select("id, name, slug, bio, photo, website, contact_email, org_type")
    .eq("id", tenant)
    .maybeSingle();

  if (orgError || !organizer) {
    return { success: false, error: "Organizer not found" };
  }
  const org = organizer as unknown as OrganizerRow;

  const requestedCategory = normalizeWebsiteCategory(
    options?.websiteCategory ?? mapOrgTypeToWebsiteCategory(org.org_type),
    template.category as WebsiteCategory
  );
  if (
    !isTemplateCompatibleWithCategory(
      template,
      requestedCategory as WebsiteCategory
    )
  ) {
    return {
      success: false,
      error: `Incompatible category: template ${template.id} is not compatible with ${requestedCategory}`,
    };
  }

  const siteTitle = options?.siteTitle?.trim() || org.name;
  let siteSlug = options?.slug?.trim() ? createSlug(options.slug!) : org.slug;
  if (isReservedWebsiteSlug(siteSlug)) {
    return {
      success: false,
      error: `The slug "${siteSlug}" is reserved by the platform. Please choose a different slug.`,
    };
  }

  // Slug uniqueness pre-check (the RPC's UNIQUE constraint is the final word).
  let counter = 1;
  let candidateSlug = siteSlug;
  while (counter < 50) {
    const { data: existing } = await supabaseAdmin
      .from("tenant_websites")
      .select("id")
      .eq("slug", candidateSlug)
      .maybeSingle();
    if (!existing) break;
    candidateSlug = `${org.slug}-${counter}`;
    counter++;
  }
  siteSlug = candidateSlug;
  if (isReservedWebsiteSlug(siteSlug)) {
    siteSlug = `${siteSlug}-site`;
  }

  const initialContent = buildInitialContentFromOrganizer(org);
  const resolved = resolveTemplateContent(
    template.id,
    template.version,
    initialContent
  );
  if (resolved.pages.length === 0) {
    return {
      success: false,
      error: `Template ${template.id} produced no pages; refusing to create an empty website.`,
    };
  }

  // Fresh page ids; resolver "<template>--<slug>" ids are internal-only and
  // never persisted — rows are matched by slug from here on.
  const pageSlugToId = new Map<string, string>();
  const pagesForRpc = resolved.pages.map((page) => {
    const pageId = generateStableId();
    pageSlugToId.set(page.slug, pageId);
    return {
      id: pageId,
      title: page.title,
      slug: page.slug,
      is_home: page.isHome,
      status: "draft",
      // v2 pages are materialized from the content doc on publish; nothing
      // (especially no samples) is stored at create time.
      blocks: [],
      sort_order: page.sortOrder,
    };
  });

  const navigationItems = resolved.navigation.map((entry, index) => ({
    id: `${template.id}-nav-${index}`,
    label: entry.label,
    href: entry.href,
    page_id: entry.pageSlug ? (pageSlugToId.get(entry.pageSlug) ?? null) : null,
    target: "_self",
    order: entry.order,
  }));

  const websiteId = generateStableId();
  const creationRequestId = options?.creationRequestId?.trim() || generateStableId();
  const metadata: Record<string, unknown> = {
    websiteCategory: requestedCategory,
    templateId: template.id,
    templateVersion: template.version,
    creationRequestId,
  };

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    "create_website_from_template",
    {
      p_website_id: websiteId,
      p_tenant_id: tenant,
      p_slug: siteSlug,
      p_site_title: siteTitle,
      p_site_tagline: null,
      p_theme_config: template.theme as unknown as never,
      p_header_config: template.header as unknown as never,
      p_footer_config: template.footer as unknown as never,
      p_status: "draft",
      p_metadata: metadata as unknown as never,
      p_pages: pagesForRpc as unknown as never,
      p_navigation: navigationItems as unknown as never,
    }
  );

  let finalWebsiteId = websiteId;
  let finalSlug = siteSlug;
  let idempotent = false;

  if (rpcError) {
    const msg = rpcError.message || "";
    if (msg.includes("already exists for tenant") || rpcError.code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("tenant_websites")
        .select("id, slug, metadata")
        .eq("tenant_id", tenant)
        .maybeSingle();
      if (
        existing &&
        (existing.metadata as Record<string, unknown>)?.creationRequestId ===
          creationRequestId
      ) {
        finalWebsiteId = existing.id as string;
        finalSlug = existing.slug as string;
        idempotent = true;
      } else {
        return { success: false, error: "Website already exists for this organization" };
      }
    } else if (msg.includes("required") || rpcError.code === "23502") {
      return { success: false, error: `Invalid snapshot: ${msg}` };
    } else {
      console.error("[createWebsiteFromV2Template] RPC failed:", rpcError);
      return { success: false, error: "Failed to create website from template" };
    }
  } else {
    const result = rpcData as {
      website_id: string;
      slug: string;
      idempotent?: boolean;
    } | null;
    finalWebsiteId = result?.website_id ?? websiteId;
    finalSlug = result?.slug ?? siteSlug;
    idempotent = Boolean(result?.idempotent);
  }

  // Follow-up steps the create RPC does not cover (all idempotent, safe to
  // replay after a partially completed first attempt):
  // 1. Legacy per-page drafts are meaningless for v2 (preview resolves from
  //    the content doc) and would blank out team preview on the public route
  //    via the website_page_drafts overlay — remove them. Page ids are
  //    re-read (not reused from the RPC input) so idempotent replays clean
  //    the rows the first attempt actually created.
  const { data: createdPages } = await supabaseAdmin
    .from("website_pages")
    .select("id")
    .eq("website_id", finalWebsiteId);
  const finalizePageIds = Array.isArray(createdPages)
    ? (createdPages as Array<{ id: string }>).map((p) => p.id)
    : [];
  for (const pageId of finalizePageIds) {
    const { error: draftDeleteErr } = await supabaseAdmin
      .from("website_page_drafts")
      .delete()
      .eq("page_id", pageId);
    if (draftDeleteErr) {
      console.error("[createWebsiteFromV2Template] page draft cleanup failed:", draftDeleteErr);
    }
  }

  // 2. First content draft. ignoreDuplicates so an idempotent replay never
  // clobbers content the owner already edited.
  const { error: draftErr } = await supabaseAdmin
    .from("website_content_drafts")
    .upsert(
      {
        website_id: finalWebsiteId,
        content: initialContent,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "website_id", ignoreDuplicates: true }
    );
  if (draftErr) {
    console.error("[createWebsiteFromV2Template] initial content draft failed:", draftErr);
    return {
      success: false,
      error:
        "Website was created but the initial content draft could not be saved. Retry with the same creation request id.",
    };
  }

  revalidatePath(`/dashboard/org/${tenant}/website`);

  return {
    success: true,
    data: { websiteId: finalWebsiteId, slug: finalSlug, idempotent },
  };
}

export interface V2BuilderState {
  websiteId: string;
  tenantId: string;
  websiteSlug: string;
  siteTitle: string;
  template: { id: string; version: string; name: string };
  contentDraftOrLive: ContentDoc;
  draftVersion: number;
  hasDraft: boolean;
  sampleFieldsInUse: string[];
  readiness: PublishReadiness;
  canPublish: boolean;
  userRole: EntityRole | null;
  /** Resolved preview pages (samples merged, render-only — never persisted). */
  previewPages: ResolvedPage[];
  omittedPages: OmittedPage[];
  skipped: SkippedSection[];
}

/**
 * Builder snapshot for a v2 site: live + draft content (via the existing
 * getContentForBuilder, which re-authorizes), readiness, role, and resolved
 * preview pages. Read access follows getContentForBuilder (all roles).
 */
export async function getBuilderState(
  websiteId: string
): Promise<ContentActionResult<V2BuilderState>> {
  const builder = await getContentForBuilder(websiteId);
  if (!builder.success || !builder.data) {
    return { success: false, error: builder.error ?? "Failed to load website." };
  }
  const data = builder.data;

  const metadata = data.metadata ?? {};
  const templateId =
    typeof metadata.templateId === "string" ? metadata.templateId : undefined;
  const templateVersion =
    typeof metadata.templateVersion === "string" ? metadata.templateVersion : undefined;
  const template =
    templateId !== undefined
      ? getFlagshipTemplate(templateId, templateVersion)
      : undefined;
  if (!template) {
    return {
      success: false,
      error: "Builder state is only available for template-first (v2) websites.",
    };
  }

  const effective = data.draftContent ?? data.liveContent;
  const resolved = resolveTemplateContent(template.id, template.version, effective);
  const readiness = checkPublishReadiness(template.id, template.version, effective);

  return {
    success: true,
    data: {
      websiteId: data.websiteId,
      tenantId: data.tenantId,
      websiteSlug: data.websiteSlug,
      siteTitle: data.siteTitle,
      template: { id: template.id, version: template.version, name: template.name },
      contentDraftOrLive: effective,
      draftVersion: data.version,
      hasDraft: data.hasDraft,
      sampleFieldsInUse: resolved.sampleFields,
      readiness,
      canPublish: data.canPublish,
      userRole: data.userRole,
      previewPages: resolved.pages,
      omittedPages: resolved.omittedPages,
      skipped: resolved.skipped,
    },
  };
}
