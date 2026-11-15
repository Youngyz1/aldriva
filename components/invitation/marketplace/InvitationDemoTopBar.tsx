import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  getInvitationTemplateCreateHref,
  getInvitationTemplateDetailsHref,
} from "@/lib/invitation-template-marketplace-routes";

/**
 * Minimal, non-intrusive bar for the full-screen demo route — NOT the
 * Aldriva global navbar (that's deliberately hidden here, see Navbar.tsx /
 * CookieConsent.tsx's isInvitationTemplateDemoPath check). Just enough to
 * get back to the details page or carry the template into Create.
 */
export async function InvitationDemoTopBar({ templateId }: { templateId: string }) {
  const t = await getTranslations("InvitationMarketplace");
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-zinc-950/80 px-4 py-2.5 text-white backdrop-blur-sm">
      <Link
        href={getInvitationTemplateDetailsHref(templateId)}
        className="text-sm font-bold text-white/90 hover:text-white"
      >
        ← {t("backToDetailsButton")}
      </Link>
      <Link
        href={getInvitationTemplateCreateHref(templateId)}
        className="rounded-xl bg-orange-600 px-4 py-1.5 text-sm font-black text-white hover:bg-orange-700"
      >
        {t("createButton")}
      </Link>
    </div>
  );
}
