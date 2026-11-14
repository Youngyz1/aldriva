import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSiteUrl } from "@/lib/site-url";
import { getPublicTemplateSummary } from "@/lib/invitation-template-public-catalog";
import {
  CATEGORY_TRANSLATION_KEYS,
  getPublicTemplateFeatureTags,
} from "@/lib/invitation-template-feature-labels";
import { InvitationTemplatePreviewFrame } from "@/components/invitation/marketplace/InvitationTemplatePreviewFrame";
import {
  getInvitationTemplateCreateHref,
  getInvitationTemplateGalleryHref,
  getInvitationTemplatePreviewHref,
} from "@/lib/invitation-template-marketplace-routes";

type Params = { templateId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { templateId } = await params;
  const summary = getPublicTemplateSummary(templateId);
  if (!summary) return { title: "Template not found" };
  return {
    metadataBase: new URL(getSiteUrl()),
    title: `${summary.name} — Invitation Template`,
    description: summary.description,
    alternates: { canonical: `${getSiteUrl()}/invitations/templates/${summary.id}` },
  };
}

export default async function InvitationTemplateDetailsPage({ params }: { params: Promise<Params> }) {
  const { templateId } = await params;
  const summary = getPublicTemplateSummary(templateId);
  if (!summary) notFound();

  const t = await getTranslations("InvitationMarketplace");
  const categoryLabel = t(CATEGORY_TRANSLATION_KEYS[summary.category]);
  const featureTags = getPublicTemplateFeatureTags(summary);

  // Phase 5 (not yet built) owns real event creation; this carries the
  // chosen template through the agreed future builder-entry route shape.
  const createHref = getInvitationTemplateCreateHref(summary.id);
  // Phase 4 (not yet built) owns the full guest-facing demo route.
  const previewHref = getInvitationTemplatePreviewHref(summary.id);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10 md:px-6">
      <Link href={getInvitationTemplateGalleryHref()} className="text-sm font-bold text-orange-600 hover:text-orange-700">
        ← {t("backToGalleryButton")}
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <InvitationTemplatePreviewFrame
          templateId={summary.id}
          ariaLabel={summary.name}
          eager
          className="aspect-[3/4] rounded-xl border border-zinc-200"
        />

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">{categoryLabel}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-950">{summary.name}</h1>

          <h2 className="mt-6 text-sm font-black uppercase tracking-wide text-zinc-500">
            {t("detailsDescriptionHeading")}
          </h2>
          <p className="mt-2 text-base leading-7 text-zinc-700">{summary.description}</p>

          {featureTags.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-black uppercase tracking-wide text-zinc-500">
                {t("featuresHeading")}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {featureTags.map((tagKey) => (
                  <li
                    key={tagKey}
                    className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-700"
                  >
                    {t(tagKey)}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={createHref}
              className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700"
            >
              {t("createButton")}
            </Link>
            <Link
              href={previewHref}
              className="rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-black text-zinc-800 hover:bg-zinc-50"
            >
              {t("previewButton")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
