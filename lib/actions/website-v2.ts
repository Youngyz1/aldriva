/**
 * lib/actions/website-v2.ts
 *
 * Server actions for template-first (v2 flagship) websites (Stage 4A).
 * Server side only — no editor UI here.
 *
 * - createWebsiteFromV2Template: owner/admin/manager only (same
 *   checkTenantAccess + isAdmin bypass family as lib/actions/website-content.ts;
 *   ids from the client are verified server-side, never trusted). Validates the
 *   template id against the v2 flagship registry without using organizer
 *   category as a compatibility gate, builds the initial content doc through
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
  resolveWebsiteCategoryForOrganizer,
  type WebsiteCategory,
} from "@/lib/website-category";
import {
  getFlagshipTemplate,
  type WebsiteTemplateV2,
} from "@/lib/website-template-v2";
import type { ContentDoc } from "@/lib/website-content";
import { buildInitialContentFromOrganizer } from "@/lib/website-v2-initial-content";
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
import { getTenantSiteBuilderLiveUrl } from "@/lib/website-structured-data";
import { resolveStorefrontCurrency } from "@/lib/website-v2-theme";
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

  const { data: linkedBusiness } = await supabaseAdmin
    .from("businesses")
    .select("industry, category, business_type, created_at")
    .eq("organizer_id", tenant)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const requestedCategory = normalizeWebsiteCategory(
    options?.websiteCategory ?? resolveWebsiteCategoryForOrganizer(
      org.org_type,
      linkedBusiness?.category ?? linkedBusiness?.business_type ?? linkedBusiness?.industry
    ),
    template.category as WebsiteCategory
  );
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
    initialContent,
    { siteSlug }
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
    brand: { accentId: template.defaultAccentId ?? "terracotta" },
    creationRequestId,
    // New restaurant sites price in XOF unless the owner changes it later in
    // Site settings (metadata.storefront.currency). Other templates keep the
    // USD default; the country fallback upgrades them when relevant.
    storefront: {
      currency: template.id === "restaurant-table-flame" ? "XOF" : "USD",
    },
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
  isPublished: boolean;
  publicUrl: string;
  accentId?: string;
  storefront: {
    businessId: string | null;
    businessName: string | null;
    industry: string;
    category: string;
    businessType: string | null;
    offerings: string[];
    timeZone: string;
    country: string | null;
    currency: string;
  };
  template: { id: string; version: string; name: string };
  templateManifest: WebsiteTemplateV2;
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

export interface V2MenuItemChoice {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  sectionName: string;
}

/**
 * Lists menu choices for a website after deriving its tenant from the stored
 * website row. Browser-supplied tenant ids and menu item ids are never trusted.
 */
export async function getV2MenuItemChoices(
  websiteId: string
): Promise<{ success: true; data: V2MenuItemChoice[] } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized: Please sign in." };
  const websiteKey = typeof websiteId === "string" ? websiteId.trim() : "";
  if (!websiteKey) return { success: false, error: "Website ID is required." };

  const supabaseAdmin = createSupabaseAdmin();
  const { data: website, error: websiteError } = await supabaseAdmin
    .from("tenant_websites")
    .select("id, tenant_id, metadata")
    .eq("id", websiteKey)
    .maybeSingle();
  if (websiteError || !website) return { success: false, error: "Website not found." };

  const metadata = website.metadata && typeof website.metadata === "object"
    ? website.metadata as Record<string, unknown>
    : {};
  const templateId = typeof metadata.templateId === "string" ? metadata.templateId : "";
  const templateVersion = typeof metadata.templateVersion === "string" ? metadata.templateVersion : undefined;
  if (!getFlagshipTemplate(templateId, templateVersion)) {
    return { success: false, error: "Menu choices are only available for v2 websites." };
  }

  const isSuperAdmin = await isAdmin();
  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, website.tenant_id as string, [
      "owner", "admin", "manager", "editor",
    ]);
    if (!access.hasAccess) return { success: false, error: "Forbidden: insufficient website permissions." };
  }

  const tenantId = website.tenant_id as string;
  const { data: sections, error: sectionsError } = await supabaseAdmin
    .from("menu_sections")
    .select("id, name")
    .eq("organizer_id", tenantId)
    .order("position", { ascending: true });
  if (sectionsError) return { success: false, error: "Failed to load menu sections." };
  const sectionRows = (sections ?? []) as Array<{ id: string; name: string }>;
  if (sectionRows.length === 0) return { success: true, data: [] };

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, description, price, image_url, section_id")
    .eq("organizer_id", tenantId)
    .eq("is_active", true)
    .in("section_id", sectionRows.map((section) => section.id))
    .order("position", { ascending: true });
  if (itemsError) return { success: false, error: "Failed to load menu items." };

  const sectionNameById = new Map(sectionRows.map((section) => [section.id, section.name]));
  return {
    success: true,
    data: ((items ?? []) as Array<{
      id: string;
      name: string;
      description?: string | null;
      price?: number | null;
      image_url?: string | null;
      section_id: string;
    }>).flatMap((item) => {
      const sectionName = sectionNameById.get(item.section_id);
      if (!sectionName) return [];
      return [{
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        imageUrl: item.image_url,
        sectionName,
      }];
    }),
  };
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
  const supabaseAdmin = createSupabaseAdmin();
  const { data: linkedBusiness } = await supabaseAdmin
    .from("businesses")
    .select("id, name, industry, category, business_type, offerings, country, created_at")
    .eq("organizer_id", data.tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const storefrontCurrency = resolveStorefrontCurrency(metadata, linkedBusiness?.country ?? null);
  const storefront = {
    businessId: typeof linkedBusiness?.id === "string" ? linkedBusiness.id : null,
    businessName: typeof linkedBusiness?.name === "string" ? linkedBusiness.name : null,
    industry: typeof linkedBusiness?.industry === "string" ? linkedBusiness.industry : "",
    category: typeof linkedBusiness?.category === "string" ? linkedBusiness.category : "",
    businessType: typeof linkedBusiness?.business_type === "string" ? linkedBusiness.business_type : null,
    offerings: Array.isArray(linkedBusiness?.offerings)
      ? linkedBusiness.offerings.filter((key: unknown): key is string => typeof key === "string")
      : [],
    timeZone: typeof metadata.timezone === "string" ? metadata.timezone : "Africa/Abidjan",
    country: typeof linkedBusiness?.country === "string" ? linkedBusiness.country : null,
    currency: storefrontCurrency,
  };
  const resolved = resolveTemplateContent(template.id, template.version, effective, {
    siteSlug: data.websiteSlug,
    business: storefront,
    timeZone: storefront.timeZone,
  });
  const readiness = checkPublishReadiness(template.id, template.version, effective);

  return {
    success: true,
    data: {
      websiteId: data.websiteId,
      tenantId: data.tenantId,
      websiteSlug: data.websiteSlug,
      siteTitle: data.siteTitle,
      isPublished: data.websiteStatus === "published",
      publicUrl: getTenantSiteBuilderLiveUrl(data.websiteSlug),
      accentId: metadata.brand && typeof metadata.brand === "object" && !Array.isArray(metadata.brand) && typeof (metadata.brand as Record<string, unknown>).accentId === "string"
        ? (metadata.brand as Record<string, string>).accentId
        : undefined,
      storefront,
      template: { id: template.id, version: template.version, name: template.name },
      templateManifest: template,
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
