import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { getBuilderState, getV2MenuItemChoices } from "@/lib/actions/website-v2";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getV2TemplateForWebsite, resolveStorefrontCurrency } from "@/lib/website-v2-theme";
import { isValidLocale, getLocaleFromAcceptLanguage, type Locale } from "@/i18n/routing";
import { V2WebsitePreviewClient } from "@/components/dashboard/website/v2/V2WebsitePreviewClient";

export const metadata: Metadata = {
  title: "Website Preview | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

/**
 * Chrome-free live preview for the v2 website editor, rendered inside the
 * editor's device iframe. Lives outside the dashboard layout (like
 * app/invitation/builder-preview/[eventId]) so no dashboard sidebar, header,
 * or org shell wraps the framed document; the root Navbar and cookie banner
 * hide themselves on /website-preview/* paths.
 *
 * Renders purely from resolver output — v2 pages are only materialized in
 * website_pages on publish, so this route must never require those rows.
 */
export default async function WebsiteV2PreviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ websiteId?: string }>;
}) {
  await connection();
  const [{ orgId: tenantId }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/dashboard/org/${encodeURIComponent(tenantId)}/website/builder`);

  const isSuperAdmin = await isAdmin();
  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, ["owner", "admin", "manager", "editor"]);
    if (!access.hasAccess) {
      console.warn("[website-preview] denied: no tenant access", { tenantId });
      return notFound();
    }
  }

  const websiteId = typeof query.websiteId === "string" ? query.websiteId.trim() : "";
  if (!websiteId) {
    console.warn("[website-preview] denied: missing websiteId");
    return notFound();
  }
  const admin = createSupabaseAdmin();
  const { data: website, error } = await admin
    .from("tenant_websites")
    .select("id, tenant_id, slug, site_title, metadata")
    .eq("id", websiteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !website) {
    console.warn("[website-preview] denied: website not found", { websiteId, tenantId });
    return notFound();
  }

  const template = getV2TemplateForWebsite(website.metadata);
  if (!template) {
    console.warn("[website-preview] denied: no v2 template", { websiteId });
    return notFound();
  }
  const state = await getBuilderState(website.id as string);
  if (!state.success || !state.data) {
    console.warn("[website-preview] denied: builder state failed", { websiteId, error: state.error });
    return notFound();
  }
  const menuResult = template.id === "restaurant-table-flame" || template.id === "restaurant-savannah"
    ? await getV2MenuItemChoices(website.id as string)
    : { success: true as const, data: [] };
  const menuItems = menuResult.success ? menuResult.data : [];
  const homePage = state.data.previewPages.find((page) => page.isHome) ?? state.data.previewPages[0];
  if (!homePage) {
    console.warn("[website-preview] denied: no emitted pages", { websiteId });
    return notFound();
  }

  // Same storefront currency + locale as the published site so preview prices
  // match byte-for-byte.
  const { data: countryRow } = await admin
    .from("businesses")
    .select("country")
    .eq("organizer_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const currency = resolveStorefrontCurrency(
    website.metadata,
    (countryRow as { country?: string | null } | null)?.country ?? null
  );
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const currencyLocale: Locale =
    cookieLocale && isValidLocale(cookieLocale)
      ? cookieLocale
      : getLocaleFromAcceptLanguage(headerStore.get("accept-language"));

  return (
    <V2WebsitePreviewClient
      websiteId={website.id as string}
      tenantId={tenantId}
      siteTitle={website.site_title as string}
      siteSlug={website.slug as string}
      template={template}
      initialContent={state.data.contentDraftOrLive}
      initialPageSlug={homePage.slug}
      menuItems={menuItems}
      emittedPages={state.data.previewPages}
      accentId={state.data.accentId}
      paletteId={state.data.paletteId}
      backgroundPattern={state.data.backgroundPattern}
      currency={currency}
      currencyLocale={currencyLocale}
      business={state.data.storefront}
    />
  );
}
