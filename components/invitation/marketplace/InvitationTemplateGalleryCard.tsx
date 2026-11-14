import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { PublicTemplateSummary } from "@/lib/invitation-template-public-catalog";
import {
  CATEGORY_TRANSLATION_KEYS,
  getPublicTemplateFeatureTags,
} from "@/lib/invitation-template-feature-labels";
import { InvitationTemplatePreviewFrame } from "@/components/invitation/marketplace/InvitationTemplatePreviewFrame";
import { getInvitationTemplateDetailsHref } from "@/lib/invitation-template-marketplace-routes";

const MAX_CARD_FEATURE_TAGS = 3;

export async function InvitationTemplateGalleryCard({ summary }: { summary: PublicTemplateSummary }) {
  const t = await getTranslations("InvitationMarketplace");
  const categoryLabel = t(CATEGORY_TRANSLATION_KEYS[summary.category]);
  const featureTags = getPublicTemplateFeatureTags(summary).slice(0, MAX_CARD_FEATURE_TAGS);

  return (
    // The live preview frame can render its own anchors (e.g. in-page scroll
    // links inside an action_portal block) — an outer <Link> wrapping it
    // would nest <a> inside <a>, invalid HTML that breaks hydration. The
    // whole-card-clickable overlay below is a sibling, not a parent, of the
    // preview frame, so it never contains another interactive element.
    <div className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
      <InvitationTemplatePreviewFrame
        templateId={summary.id}
        ariaLabel={summary.name}
        className="aspect-[3/4] border-b border-zinc-200"
      />
      <div className="p-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-orange-600">{categoryLabel}</p>
        <h3 className="mt-1 text-base font-black text-zinc-950">{summary.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-zinc-600">{summary.description}</p>
        {featureTags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {featureTags.map((tagKey) => (
              <li
                key={tagKey}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700"
              >
                {t(tagKey)}
              </li>
            ))}
          </ul>
        )}
        <span className="mt-4 inline-block text-sm font-bold text-orange-600 group-hover:text-orange-700">
          {t("viewDetailsButton")} →
        </span>
      </div>
      <Link
        href={getInvitationTemplateDetailsHref(summary.id)}
        className="absolute inset-0 rounded-xl focus:outline-2 focus:outline-offset-2 focus:outline-orange-600"
        aria-label={summary.name}
      />
    </div>
  );
}
