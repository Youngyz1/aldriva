"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { getTemplateById, getTemplateByIdVersion } from "@/lib/website-template-registry";
import { isTemplateCompatibleWithCategory } from "@/lib/website-category";
import { normalizeWebsiteCategory, type WebsiteCategory } from "@/lib/website-category";
import { validateBlocks, normalizeBlocks, cloneBlockWithNewIds, generateStableId } from "@/lib/website-blocks";
import { buildHydrationContext, hydrateBlocks } from "@/lib/website-hydration";
import { isReservedWebsiteSlug } from "@/lib/website-nav";

export interface InstantiateWebsiteInput {
  organizerId: string;
  templateId: string;
  templateVersion?: string;
  siteTitle?: string;
  slug?: string;
  websiteCategory?: string;
  creationRequestId?: string;
  businessId?: string | null;
}

export interface InstantiateWebsiteResult {
  success: boolean;
  data?: { websiteId: string; slug: string; idempotent?: boolean };
  error?: string;
}

/**
 * Atomic template instantiation.
 * All validation/hydration happens in application layer; persistence is delegated
 * to the transactional RPC create_website_from_template via service_role.
 */
export async function instantiateWebsiteFromTemplate(
  input: InstantiateWebsiteInput
): Promise<InstantiateWebsiteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  const organizerId = input.organizerId?.trim();
  if (!organizerId) {
    return { success: false, error: "Organizer ID is required." };
  }

  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }

  // Resolve canonical template + exact version
  const template = input.templateVersion
    ? getTemplateByIdVersion(input.templateId, input.templateVersion)
    : getTemplateById(input.templateId);

  if (!template) {
    if (input.templateVersion) {
      return { success: false, error: `Invalid template version: ${input.templateId}@${input.templateVersion}` };
    }
    return { success: false, error: `Invalid template: ${input.templateId}` };
  }

  // Validate exact version if requested
  if (input.templateVersion && template.version !== input.templateVersion) {
    return { success: false, error: `Invalid template version: ${input.templateId}@${input.templateVersion}` };
  }

  // Validate category compatibility
  const requestedCategory = normalizeWebsiteCategory(
    input.websiteCategory ?? template.category,
    template.category as WebsiteCategory
  );

  if (!isTemplateCompatibleWithCategory(template, requestedCategory as WebsiteCategory)) {
    return { success: false, error: `Incompatible category: template ${template.id} is not compatible with ${requestedCategory}` };
  }

  const supabaseAdmin = createSupabaseAdmin();

  // Load only approved business data (whitelisted columns)
  const { data: organizer, error: orgError } = await supabaseAdmin
    .from("organizers")
    .select("id, name, slug, bio, photo, website, contact_email, org_type")
    .eq("id", organizerId)
    .maybeSingle();

  if (orgError || !organizer) {
    return { success: false, error: "Organizer not found" };
  }

  const siteTitle = input.siteTitle?.trim() || organizer.name;
  let siteSlug = input.slug?.trim() ? createSlug(input.slug!) : organizer.slug;

  if (isReservedWebsiteSlug(siteSlug)) {
    return { success: false, error: `The slug "${siteSlug}" is reserved by the platform. Please choose a different slug.` };
  }

  // Ensure slug uniqueness pre-check (RPC will also enforce unique)
  let counter = 1;
  let candidateSlug = siteSlug;
  while (counter < 50) {
    const { data: existing } = await supabaseAdmin.from("tenant_websites").select("id").eq("slug", candidateSlug).maybeSingle();
    if (!existing) break;
    candidateSlug = `${organizer.slug}-${counter}`;
    counter++;
  }
  siteSlug = candidateSlug;
  if (isReservedWebsiteSlug(siteSlug)) {
    siteSlug = `${siteSlug}-site`;
  }

  const hydrationCtx = buildHydrationContext(organizer as unknown as Record<string, unknown>);

  // Deep-copy + fresh IDs + hydration + validation
  const websiteId = generateStableId();
  const creationRequestId = input.creationRequestId?.trim() || generateStableId();

  const pagesForRpc: Array<Record<string, unknown>> = [];
  const navigationItems: Array<Record<string, unknown>> = [];

  // Prepare pages: deep copy, fresh block/item ids, hydration, validation
  for (const tplPage of template.pages) {
    // Deep copy blocks and generate fresh ids
    const freshBlocks = tplPage.blocks.map((b) => cloneBlockWithNewIds(b as unknown as Record<string, unknown> as never) as unknown as never);
    // Normalize to ensure ids
    const normalized = normalizeBlocks(freshBlocks as unknown as never);
    const hydrated = hydrateBlocks(normalized as unknown as never[], hydrationCtx) as unknown as never[];

    // Validate final snapshot
    const validation = validateBlocks(hydrated);
    if (!validation.success) {
      return { success: false, error: `Invalid snapshot for page ${tplPage.slug}: ${validation.error}` };
    }

    const pageId = generateStableId();
    pagesForRpc.push({
      id: pageId,
      title: tplPage.title,
      slug: tplPage.slug,
      is_home: tplPage.isHome,
      status: "draft",
      blocks: hydrated,
      sort_order: tplPage.sortOrder,
    });
  }

  // Build navigation with fresh ids mapping page slugs to new page ids
  const pageSlugToId = new Map<string, string>();
  for (const p of pagesForRpc) {
    pageSlugToId.set(p.slug as string, p.id as string);
  }

  for (const nav of template.navigation) {
    // nav in registry is NavigationItem with page_id null; we map href/pageSlug if present
    // For now, template navigation uses href "/" for home and pageSlug hint is encoded in href?
    // We will attempt to map: if href === "/" => home, else if href matches `/${slug}` => map slug
    let targetPageId: string | null = null;
    const href = (nav as unknown as { href: string }).href;
    const pageSlug = (nav as unknown as { pageSlug?: string }).pageSlug;
    if (pageSlug && pageSlugToId.has(pageSlug)) {
      targetPageId = pageSlugToId.get(pageSlug)!;
    } else if (href === "/" && pageSlugToId.has("home")) {
      targetPageId = pageSlugToId.get("home")!;
    } else if (href && href.startsWith("/") && href !== "/") {
      const slugCandidate = href.replace(/^\//, "").split("/")[0];
      if (pageSlugToId.has(slugCandidate)) targetPageId = pageSlugToId.get(slugCandidate)!;
    }

    navigationItems.push({
      id: generateStableId(),
      label: (nav as unknown as { label: string }).label,
      href: href,
      page_id: targetPageId,
      target: (nav as unknown as { target?: string }).target ?? "_self",
      order: (nav as unknown as { order: number }).order,
    });
  }

  const metadata: Record<string, unknown> = {
    websiteCategory: requestedCategory,
    templateId: template.id,
    templateVersion: template.version,
    creationRequestId,
    ...(input.businessId ? { business_id: input.businessId } : {}),
  };

  // Call transactional RPC via service_role
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("create_website_from_template", {
    p_website_id: websiteId,
    p_tenant_id: organizerId,
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
  });

  if (rpcError) {
    // Map unique violations to user-friendly messages
    const msg = rpcError.message || "";
    if (msg.includes("already exists for tenant") || rpcError.code === "23505") {
      // Check if it's idempotent retry (same requestId) — try to fetch existing
      const { data: existing } = await supabaseAdmin
        .from("tenant_websites")
        .select("id, slug, metadata")
        .eq("tenant_id", organizerId)
        .maybeSingle();
      if (existing && (existing.metadata as Record<string, unknown>)?.creationRequestId === creationRequestId) {
        return { success: true, data: { websiteId: existing.id, slug: existing.slug, idempotent: true } };
      }
      return { success: false, error: "Website already exists for this organization" };
    }
    if (msg.includes("required") || rpcError.code === "23502") {
      return { success: false, error: `Invalid snapshot: ${msg}` };
    }
    console.error("[instantiateWebsiteFromTemplate] RPC failed:", rpcError);
    return { success: false, error: "Failed to create website from template" };
  }

  const result = rpcData as { website_id: string; slug: string; idempotent?: boolean } | null;
  const returnedWebsiteId = result?.website_id ?? websiteId;
  const returnedSlug = result?.slug ?? siteSlug;
  const isIdempotent = Boolean(result?.idempotent);

  revalidatePath(`/dashboard/org/${organizerId}/website`);

  return {
    success: true,
    data: { websiteId: returnedWebsiteId, slug: returnedSlug, idempotent: isIdempotent },
  };
}
