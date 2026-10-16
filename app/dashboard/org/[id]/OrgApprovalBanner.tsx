"use client";

/**
 * app/dashboard/org/[id]/OrgApprovalBanner.tsx
 *
 * Renders a localized status banner when the organizer's linked business is
 * not yet approved (pending_review), rejected, or archived.
 *
 * Shown only when relevant (pending / rejected / archived).
 * Hidden for "approved" (active business) and "none" (no business linked).
 * The sidebar continues to show Menu and Website for all states.
 */

import type { ApprovalState } from "@/lib/business-approval";
import { useLocale } from "next-intl";

interface Props {
  approvalState: ApprovalState;
}

const STRINGS = {
  en: {
    pending: {
      title: "Awaiting approval",
      body: "Your business is under review. You can still edit your menu and build your website. You will be able to publish your site and accept orders once approved.",
    },
    rejected: {
      title: "Not approved",
      body: "Your business application was not approved. Please contact support for more information.",
    },
    archived: {
      title: "Business archived",
      body: "This business has been archived. Publishing and online ordering are not available.",
    },
  },
  fr: {
    pending: {
      title: "En attente d'approbation",
      body: "Votre établissement est en cours d'examen. Vous pouvez toujours modifier votre menu et créer votre site. Vous pourrez publier et accepter des commandes une fois approuvé.",
    },
    rejected: {
      title: "Non approuvé",
      body: "Votre demande d'établissement n'a pas été approuvée. Veuillez contacter le support pour plus d'informations.",
    },
    archived: {
      title: "Établissement archivé",
      body: "Cet établissement a été archivé. La publication et la commande en ligne ne sont pas disponibles.",
    },
  },
} as const;

type SupportedLocale = keyof typeof STRINGS;
type BannerKey = keyof (typeof STRINGS)["en"];

const BANNER_FOR_STATE: Partial<Record<ApprovalState, BannerKey>> = {
  pending: "pending",
  rejected: "rejected",
  archived: "archived",
};

const VARIANT_STYLES: Record<BannerKey, string> = {
  pending: "bg-amber-50 border-amber-200 text-amber-900",
  rejected: "bg-red-50 border-red-200 text-red-900",
  archived: "bg-zinc-100 border-zinc-300 text-zinc-700",
};

export default function OrgApprovalBanner({ approvalState }: Props) {
  const locale = useLocale() as SupportedLocale;
  const key = BANNER_FOR_STATE[approvalState];
  if (!key) return null; // approved or none — no banner

  const lang = STRINGS[locale] ?? STRINGS.en;
  const copy = lang[key];
  const styles = VARIANT_STYLES[key];

  return (
    <div className={`border-b px-4 py-3 sm:px-6 lg:px-8 ${styles}`} role="status" aria-live="polite">
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="mt-0.5 text-xs">{copy.body}</p>
    </div>
  );
}
