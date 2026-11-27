/**
 * components/events/CreateInvitationButton.tsx
 *
 * "Create invitation" entry point — sits next to "Create event" on the
 * Events dashboard. Now links to the public invitation template gallery
 * instead of immediately creating a draft event; the actual
 * createInvitationDraft call happens later, once a template is chosen (see
 * app/invitations/templates).
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { getInvitationTemplateGalleryHref } from "@/lib/invitation-template-marketplace-routes";

export function CreateInvitationButton({
  className,
  label = "Create invitation",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link
      href={getInvitationTemplateGalleryHref()}
      className={cn(
        "shrink-0 rounded-xl border border-orange-200 bg-white px-5 py-3 text-sm font-black text-orange-700 transition hover:bg-orange-50",
        className
      )}
    >
      {label}
    </Link>
  );
}
