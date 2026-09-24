"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireTenantContext } from "@/lib/tenant-context";
import type { EntityRole } from "@/lib/entity-auth";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";

import {
  ThemeConfig,
  HeaderConfig,
  FooterConfig,
  NavigationItem,
  WebsiteStatus,
  TenantWebsiteInput,
  PageInput,
  DEFAULT_THEME_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  sanitizeNavOnPageDelete,
  sanitizeNavOnPageSlugChange,
  isReservedWebsiteSlug,
} from "@/lib/website-nav";

export type {
  ThemeConfig,
  HeaderConfig,
  FooterConfig,
  NavigationItem,
  WebsiteStatus,
  TenantWebsiteInput,
  PageInput,
};

/**
 * Helper to resolve tenant context from a website ID
 */
async function resolveContextByWebsiteId(
  websiteId: string,
  userId: string,
  allowedRoles: EntityRole[] = ["owner", "admin", "manager", "editor"]
) {
  const supabaseAdmin = createSupabaseAdmin();
  const { data: website, error } = await supabaseAdmin
    .from("tenant_websites")
    .select("id, tenant_id, slug")
    .eq("id", websiteId)
    .maybeSingle();

  if (error || !website) {
    throw new Error("Website not found");
  }

  await requireTenantContext(userId, website.tenant_id, allowedRoles);
  return website;
}

/**
 * Retrieves the full website configuration for an organizer/tenant
 */
export async function getTenantWebsite(organizerId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: website, error: siteError } = await supabaseAdmin
    .from("tenant_websites")
    .select("*")
    .eq("tenant_id", organizerId)
    .maybeSingle();

  if (siteError) {
    console.error("[getTenantWebsite] Error loading website:", siteError.message);
    return { success: false, error: "Failed to load website" };
  }

  if (!website) {
    return { success: true, data: null };
  }

  const [{ data: pages }, { data: nav }] = await Promise.all([
    supabaseAdmin
      .from("website_pages")
      .select("*")
      .eq("website_id", website.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("website_navigation")
      .select("*")
      .eq("website_id", website.id)
      .maybeSingle(),
  ]);

  return {
    success: true,
    data: {
      website,
      pages: pages || [],
      navigation: nav?.items || [],
    },
  };
}

/**
 * Creates a new tenant website with default Home page and initial navigation
 */
export async function createTenantWebsite(organizerId: string, input?: TenantWebsiteInput) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager"]);
  } catch {
    return { success: false, error: "Forbidden: insufficient entity permissions" };
  }

  const supabaseAdmin = createSupabaseAdmin();

  // Check if organizer exists and fetch default name/slug
  const { data: organizer, error: orgError } = await supabaseAdmin
    .from("organizers")
    .select("id, name, slug")
    .eq("id", organizerId)
    .maybeSingle();

  if (orgError || !organizer) {
    return { success: false, error: "Organizer not found" };
  }

  const siteTitle = input?.site_title?.trim() || organizer.name;
  let siteSlug = input?.slug?.trim() ? createSlug(input.slug) : organizer.slug;

  if (isReservedWebsiteSlug(siteSlug)) {
    return {
      success: false,
      error: `The slug "${siteSlug}" is reserved by the platform. Please choose a different slug.`,
    };
  }

  // Ensure website slug uniqueness
  let counter = 1;
  while (counter < 50) {
    const { data: existing } = await supabaseAdmin
      .from("tenant_websites")
      .select("id")
      .eq("slug", siteSlug)
      .maybeSingle();
    if (!existing) break;
    siteSlug = `${organizer.slug}-${counter}`;
    counter++;
  }

  if (isReservedWebsiteSlug(siteSlug)) {
    siteSlug = `${siteSlug}-site`;
  }

  const themeConfig = { ...DEFAULT_THEME_CONFIG, ...(input?.theme_config || {}) };
  const headerConfig = { ...DEFAULT_HEADER_CONFIG, ...(input?.header_config || {}) };
  const footerConfig = { ...DEFAULT_FOOTER_CONFIG, ...(input?.footer_config || {}) };

  // Stage C: build metadata payload (websiteCategory, template hints, etc.)
  const metadata: Record<string, unknown> = {
    ...(input?.metadata || {}),
  };
  if (input?.websiteCategory) {
    metadata.websiteCategory = input.websiteCategory;
  }

  // 1. Insert website row
  const { data: website, error: insertError } = await supabaseAdmin
    .from("tenant_websites")
    .insert({
      tenant_id: organizerId,
      slug: siteSlug,
      site_title: siteTitle,
      site_tagline: input?.site_tagline || null,
      theme_config: themeConfig,
      header_config: headerConfig,
      footer_config: footerConfig,
      status: input?.status || "draft",
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    })
    .select("*")
    .single();

  if (insertError || !website) {
    if (insertError) console.error("[createTenantWebsite] Insert error:", insertError.message);
    return { success: false, error: "Failed to create website" };
  }

  // 2. Create default Home page
  const { data: homePage } = await supabaseAdmin
    .from("website_pages")
    .insert({
      website_id: website.id,
      title: "Home",
      slug: "home",
      is_home: true,
      status: "draft",
      sort_order: 0,
      blocks: [],
    })
    .select("*")
    .single();

  // 3. Create default navigation entry
  const initialNavItems: NavigationItem[] = homePage
    ? [
        {
          id: crypto.randomUUID(),
          label: "Home",
          href: "/",
          page_id: homePage.id,
          order: 0,
          target: "_self",
        },
      ]
    : [];

  await supabaseAdmin.from("website_navigation").insert({
    website_id: website.id,
    items: initialNavItems,
  });

  revalidatePath(`/dashboard/org/${organizerId}/website`);
  return { success: true, data: website };
}

/**
 * Updates tenant website settings (title, theme, header, footer, status)
 */
export async function updateTenantWebsite(websiteId: string, updates: Partial<TenantWebsiteInput>) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const website = await resolveContextByWebsiteId(websiteId, user.id);
    const supabaseAdmin = createSupabaseAdmin();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.site_title !== undefined) updatePayload.site_title = updates.site_title.trim();
    if (updates.site_tagline !== undefined) updatePayload.site_tagline = updates.site_tagline ? updates.site_tagline.trim() : null;
    if (updates.slug !== undefined) {
      const cleanSlug = createSlug(updates.slug);
      if (isReservedWebsiteSlug(cleanSlug)) {
        return {
          success: false,
          error: `The slug "${cleanSlug}" is reserved by the platform. Please choose a different slug.`,
        };
      }
      if (cleanSlug !== website.slug) {
        const { data: existing } = await supabaseAdmin
          .from("tenant_websites")
          .select("id")
          .eq("slug", cleanSlug)
          .maybeSingle();
        if (existing) {
          return { success: false, error: "Website slug is already in use" };
        }
        updatePayload.slug = cleanSlug;
      }
    }
    if (updates.seo_title !== undefined) updatePayload.seo_title = updates.seo_title;
    if (updates.seo_description !== undefined) updatePayload.seo_description = updates.seo_description;
    if (updates.seo_og_image !== undefined) updatePayload.seo_og_image = updates.seo_og_image;
    if (updates.status !== undefined) updatePayload.status = updates.status;

    if (updates.theme_config) {
      const { data: current } = await supabaseAdmin
        .from("tenant_websites")
        .select("theme_config")
        .eq("id", websiteId)
        .single();
      updatePayload.theme_config = { ...(current?.theme_config || DEFAULT_THEME_CONFIG), ...updates.theme_config };
    }

    if (updates.header_config) {
      const { data: current } = await supabaseAdmin
        .from("tenant_websites")
        .select("header_config")
        .eq("id", websiteId)
        .single();
      updatePayload.header_config = { ...(current?.header_config || DEFAULT_HEADER_CONFIG), ...updates.header_config };
    }

    if (updates.footer_config) {
      const { data: current } = await supabaseAdmin
        .from("tenant_websites")
        .select("footer_config")
        .eq("id", websiteId)
        .single();
      updatePayload.footer_config = { ...(current?.footer_config || DEFAULT_FOOTER_CONFIG), ...updates.footer_config };
    }

    if (updates.metadata) {
      const { data: current } = await supabaseAdmin
        .from("tenant_websites")
        .select("metadata")
        .eq("id", websiteId)
        .single();
      updatePayload.metadata = { ...((current?.metadata as Record<string, unknown>) || {}), ...updates.metadata };
    }
    if (updates.websiteCategory) {
      const { data: current } = await supabaseAdmin
        .from("tenant_websites")
        .select("metadata")
        .eq("id", websiteId)
        .single();
      const existingMeta = (current?.metadata as Record<string, unknown>) || {};
      updatePayload.metadata = { ...existingMeta, websiteCategory: updates.websiteCategory };
    }

    const { data: updated, error } = await supabaseAdmin
      .from("tenant_websites")
      .update(updatePayload)
      .eq("id", websiteId)
      .select("*")
      .single();

    if (error) {
      console.error("[updateTenantWebsite] Update error:", error.message);
      return { success: false, error: "Failed to update website" };
    }

    revalidatePath(`/dashboard/org/${website.tenant_id}/website`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[updateTenantWebsite] Context error:", err);
    return { success: false, error: "Failed to update website" };
  }
}

/**
 * Creates a new page within a tenant website
 */
export async function createPage(websiteId: string, input: PageInput) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const website = await resolveContextByWebsiteId(websiteId, user.id);
    const supabaseAdmin = createSupabaseAdmin();

    const title = input.title.trim();
    if (!title) {
      return { success: false, error: "Page title is required" };
    }

    let slug = input.slug ? createSlug(input.slug) : createSlug(title);
    if (!slug) slug = "page";

    // Uniqueness check for (website_id, slug)
    const { data: existing } = await supabaseAdmin
      .from("website_pages")
      .select("id")
      .eq("website_id", websiteId)
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    // If is_home is true, clear any existing home page
    if (input.is_home) {
      await supabaseAdmin
        .from("website_pages")
        .update({ is_home: false })
        .eq("website_id", websiteId)
        .eq("is_home", true);
    }

    const { data: page, error } = await supabaseAdmin
      .from("website_pages")
      .insert({
        website_id: websiteId,
        title,
        slug,
        is_home: !!input.is_home,
        status: input.status || "draft",
        blocks: input.blocks || [],
        sort_order: input.sort_order ?? 0,
        seo_title: input.seo_title || null,
        seo_description: input.seo_description || null,
        seo_og_image: input.seo_og_image || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[createPage] Insert error:", error.message);
      return { success: false, error: "Failed to create page" };
    }

    revalidatePath(`/dashboard/org/${website.tenant_id}/website`);
    return { success: true, data: page };
  } catch (err) {
    console.error("[createPage] Error:", err);
    return { success: false, error: "Failed to create page" };
  }
}

/**
 * Updates page content, metadata, or block payloads
 */
export async function updatePage(pageId: string, updates: Partial<PageInput>) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: page, error: pageErr } = await supabaseAdmin
    .from("website_pages")
    .select("id, website_id, slug, is_home")
    .eq("id", pageId)
    .maybeSingle();

  if (pageErr || !page) {
    return { success: false, error: "Page not found" };
  }

  try {
    const website = await resolveContextByWebsiteId(page.website_id, user.id);
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) updatePayload.title = updates.title.trim();
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.blocks !== undefined) updatePayload.blocks = updates.blocks;
    if (updates.sort_order !== undefined) updatePayload.sort_order = updates.sort_order;
    if (updates.seo_title !== undefined) updatePayload.seo_title = updates.seo_title;
    if (updates.seo_description !== undefined) updatePayload.seo_description = updates.seo_description;
    if (updates.seo_og_image !== undefined) updatePayload.seo_og_image = updates.seo_og_image;

    // Handle is_home toggle
    if (updates.is_home === true && !page.is_home) {
      await supabaseAdmin
        .from("website_pages")
        .update({ is_home: false })
        .eq("website_id", page.website_id)
        .eq("is_home", true);
      updatePayload.is_home = true;
    } else if (updates.is_home === false) {
      updatePayload.is_home = false;
    }

    // Handle slug change with navigation sanitization
    if (updates.slug !== undefined && updates.slug !== page.slug) {
      const newSlug = createSlug(updates.slug);
      updatePayload.slug = newSlug;

      // Update matching navigation entries
      const { data: nav } = await supabaseAdmin
        .from("website_navigation")
        .select("id, items")
        .eq("website_id", page.website_id)
        .maybeSingle();

      if (nav && Array.isArray(nav.items)) {
        const sanitized = sanitizeNavOnPageSlugChange(nav.items as NavigationItem[], pageId, newSlug);
        await supabaseAdmin
          .from("website_navigation")
          .update({ items: sanitized, updated_at: new Date().toISOString() })
          .eq("id", nav.id);
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("website_pages")
      .update(updatePayload)
      .eq("id", pageId)
      .select("*")
      .single();

    if (error) {
      console.error("[updatePage] Update error:", error.message);
      return { success: false, error: "Failed to update page" };
    }

    revalidatePath(`/dashboard/org/${website.tenant_id}/website`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[updatePage] Error:", err);
    return { success: false, error: "Failed to update page" };
  }
}

/**
 * Deletes a page and automatically cleans up matching navigation items
 */
export async function deletePage(pageId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: page, error: pageErr } = await supabaseAdmin
    .from("website_pages")
    .select("id, website_id, is_home")
    .eq("id", pageId)
    .maybeSingle();

  if (pageErr || !page) {
    return { success: false, error: "Page not found" };
  }

  try {
    const website = await resolveContextByWebsiteId(page.website_id, user.id, ["owner", "admin", "manager"]);

    // 1. Delete page from database
    const { error: delError } = await supabaseAdmin
      .from("website_pages")
      .delete()
      .eq("id", pageId);

    if (delError) {
      console.error("[deletePage] Delete error:", delError.message);
      return { success: false, error: "Failed to delete page" };
    }

    // 2. Sanitize navigation tree by removing items referencing this page_id
    const { data: nav } = await supabaseAdmin
      .from("website_navigation")
      .select("id, items")
      .eq("website_id", page.website_id)
      .maybeSingle();

    if (nav && Array.isArray(nav.items)) {
      const sanitized = sanitizeNavOnPageDelete(nav.items as NavigationItem[], pageId);
      await supabaseAdmin
        .from("website_navigation")
        .update({ items: sanitized, updated_at: new Date().toISOString() })
        .eq("id", nav.id);
    }

    revalidatePath(`/dashboard/org/${website.tenant_id}/website`);
    return { success: true };
  } catch (err) {
    console.error("[deletePage] Error:", err);
    return { success: false, error: "Failed to delete page" };
  }
}

/**
 * Updates the navigation menu tree
 */
export async function updateNavigation(websiteId: string, items: NavigationItem[]) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const website = await resolveContextByWebsiteId(websiteId, user.id);
    const supabaseAdmin = createSupabaseAdmin();

    const { data: updated, error } = await supabaseAdmin
      .from("website_navigation")
      .update({
        items,
        updated_at: new Date().toISOString(),
      })
      .eq("website_id", websiteId)
      .select("*")
      .single();

    if (error) {
      console.error("[updateNavigation] Update error:", error.message);
      return { success: false, error: "Failed to update navigation menu" };
    }

    revalidatePath(`/dashboard/org/${website.tenant_id}/website`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[updateNavigation] Error:", err);
    return { success: false, error: "Failed to update navigation menu" };
  }
}
