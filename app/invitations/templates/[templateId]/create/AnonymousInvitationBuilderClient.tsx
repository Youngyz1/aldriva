"use client";

/**
 * app/invitations/templates/[templateId]/create/AnonymousInvitationBuilderClient.tsx
 *
 * Phase 5: mounts the EXISTING InvitationPageBuilder in persistenceMode
 * "local" — no second builder. All IndexedDB/local-draft concerns live in
 * useLocalInvitationBuilderAdapters; this component only wires its output
 * into InvitationPageBuilder's existing props.
 *
 * Port adaptation: feat also passed `cardSlug`/`cardTemplates` (resolved
 * via `getUnifiedTemplate`/`DEFAULT_INVITATION_TEMPLATES`) for the
 * UnifiedTemplatePicker's card-design step. Neither that picker nor the
 * legacy card-template catalog exists on this branch (the template is chosen
 * before reaching this route), so those two props are omitted —
 * InvitationPageBuilder defaults them to `null`/`[]`, which is a no-op
 * without the picker.
 */

import { InvitationPageBuilder } from "@/app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder";
import { useLocalInvitationBuilderAdapters } from "@/components/invitation/useLocalInvitationBuilderAdapters";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";

export function AnonymousInvitationBuilderClient({ templateId }: { templateId: string }) {
  const local = useLocalInvitationBuilderAdapters(templateId);

  if (local.status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-orange-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-6">
      {local.changedElsewhere && (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
          <span>This draft was changed in another tab. Reload this tab to see the latest version.</span>
          <button type="button" onClick={local.dismissChangedElsewhere} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}
      <InvitationPageBuilder
        eventId={local.draftId}
        initialData={local.initialData as unknown as InvitationPageDraftData}
        // A template was already chosen on the gallery/details page before
        // reaching this route — skip straight past the type/template
        // accordion sections, matching the design intent for every
        // gallery-originated draft (see docs/REA-INVITATION-IMPLEMENTATION-ROADMAP.md Phase 6).
        initialSection="basics"
        persistenceMode="local"
        onLocalSave={local.onLocalSave}
        localPersistence={local.localPersistence}
      />
    </div>
  );
}
