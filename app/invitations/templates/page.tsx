import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import {
  getPublicTemplateCatalog,
  getPublicTemplateCategories,
  type PublicTemplateSummary,
} from "@/lib/invitation-template-public-catalog";
import { CATEGORY_TRANSLATION_KEYS } from "@/lib/invitation-template-feature-labels";
import {
  getInvitationTemplateGalleryHref,
  isValidInvitationCategoryParam,
} from "@/lib/invitation-template-marketplace-routes";
import { InvitationTemplateGalleryCard } from "@/components/invitation/marketplace/InvitationTemplateGalleryCard";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Invitation Templates",
  description: "Browse every Aldriva invitation design and see it rendered with real content before you create.",
  alternates: { canonical: `${getSiteUrl()}/invitations/templates` },
};

export default async function InvitationTemplatesGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: categoryParam } = await searchParams;
  const t = await getTranslations("InvitationMarketplace");
  const catalog = getPublicTemplateCatalog();
  const categories = getPublicTemplateCategories();
  const selectedCategory = isValidInvitationCategoryParam(categoryParam, categories) ? categoryParam : null;
  const visibleTemplates: PublicTemplateSummary[] = selectedCategory
    ? catalog.filter((summary) => summary.category === selectedCategory)
    : catalog;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950">{t("galleryTitle")}</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-zinc-600">{t("galleryIntro")}</p>
      </header>

      <nav aria-label={t("galleryTitle")} className="mb-8 flex flex-wrap gap-2">
        <Link
          href={getInvitationTemplateGalleryHref()}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-bold transition",
            selectedCategory === null
              ? "bg-orange-600 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          )}
        >
          {t("categoryAll")}
        </Link>
        {categories.map((category) => (
          <Link
            key={category}
            href={getInvitationTemplateGalleryHref(category)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-bold transition",
              selectedCategory === category
                ? "bg-orange-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            )}
          >
            {t(CATEGORY_TRANSLATION_KEYS[category])}
          </Link>
        ))}
      </nav>

      {visibleTemplates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-base font-black text-zinc-950">{t("emptyStateTitle")}</p>
          <p className="mt-1 text-sm font-medium text-zinc-500">{t("emptyStateBody")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleTemplates.map((summary) => (
            <InvitationTemplateGalleryCard key={summary.id} summary={summary} />
          ))}
        </div>
      )}
    </main>
  );
}
