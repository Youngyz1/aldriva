import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { getTenantWebsite } from "@/lib/actions/website";
import {
  getPageBuilderData,
  getBuilderEmbedOptions,
} from "@/lib/actions/website-builder";
import WebsiteBuilderClient from "@/components/dashboard/website/builder/WebsiteBuilderClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pageId?: string }>;
}

export default async function WebsiteBuilderPage({
  params,
  searchParams,
}: PageProps) {
  const { id: tenantId } = await params;
  const { pageId: queryPageId } = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // 1. Upfront Entity Role Authorization Check (defense-in-depth before any queries)
  const isSuperAdmin = await isAdmin();
  if (!isSuperAdmin) {
    const access = await checkTenantAccess(user.id, tenantId, [
      "owner",
      "admin",
      "manager",
      "editor",
    ]);

    if (!access.hasAccess) {
      return notFound();
    }
  }

  // 2. Fetch tenant website configuration (no side-effects on GET)
  const siteRes = await getTenantWebsite(tenantId);
  const website = siteRes.data?.website;
  const pages = siteRes.data?.pages || [];

  if (!website || pages.length === 0) {
    // If website has not been created yet, redirect to the overview setup page
    redirect(`/dashboard/org/${tenantId}/website`);
  }

  // 2. Determine target pageId
  let targetPageId = queryPageId;
  if (!targetPageId) {
    const homePage = pages.find((p) => p.slug === "home" || p.slug === "index") || pages[0];
    targetPageId = homePage?.id;
  }

  if (!targetPageId) {
    return notFound();
  }

  // 3. Load builder data and tenant embed options in parallel
  const [builderRes, embedRes] = await Promise.all([
    getPageBuilderData(targetPageId),
    getBuilderEmbedOptions(tenantId),
  ]);

  if (!builderRes.success || !builderRes.data) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Could Not Load Page Builder
          </h2>
          <p className="mt-2 text-xs text-zinc-500">
            {builderRes.error || "You might not have sufficient permissions to edit this website."}
          </p>
          <a
            href={`/dashboard/org/${tenantId}/website`}
            className="mt-4 inline-block rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white"
          >
            Back to Website Overview
          </a>
        </div>
      </div>
    );
  }

  const embedOptions = embedRes.success && embedRes.data
    ? embedRes.data
    : { events: [], products: [], fundraisers: [] };

  return (
    <WebsiteBuilderClient
      initialData={builderRes.data}
      availableEmbedOptions={embedOptions}
    />
  );
}
