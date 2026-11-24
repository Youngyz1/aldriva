/**
 * components/events/CreateInvitationCard.tsx
 *
 * Third option on the /dashboard/events/new choice grid: browse the public
 * invitation template gallery first, instead of immediately creating a
 * draft event. The actual event-creation call (createInvitationDraft) now
 * happens later, once a template is chosen — see the gallery/details pages
 * under app/invitations/templates. This card itself no longer creates
 * anything; it is a plain link.
 */

import Link from "next/link";
import { getInvitationTemplateGalleryHref } from "@/lib/invitation-template-marketplace-routes";

export function CreateInvitationCard() {
  return (
    <Link
      href={getInvitationTemplateGalleryHref()}
      className="block rounded-2xl border border-violet-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="text-sm font-black uppercase tracking-wide text-violet-600">Invitation</p>
      <h2 className="mt-2 text-2xl font-black text-zinc-950">Create invitation</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Start a private invitation event — no tickets, no public listing. Browse templates and pick
        the one that fits your celebration.
      </p>
      <span className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white">
        Browse Templates
      </span>
    </Link>
  );
}
