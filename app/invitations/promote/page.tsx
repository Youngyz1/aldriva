"use client";

/**
 * app/invitations/promote/page.tsx
 *
 * Phase 6 (layer6-step4): the post-login landing route for a local
 * (anonymous) invitation draft — handoff-design.md v3 §2/§6. Reached via
 * the `redirect` query param on /login, and directly by an
 * already-authenticated "Sign in to publish" click
 * (useLocalInvitationBuilderAdapters.ts:handleLocalSignInToPublish).
 *
 * Checks its OWN session rather than assuming the caller already did (v3
 * §0 item c) — safe to hit directly (bookmark, back button, a retried
 * OAuth callback).
 */

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { promoteLocalDraft, type PromoteLocalDraftResult } from "@/lib/invitation-local-draft-promotion";
import { isValidLocalDraftId } from "@/lib/invitation-promotion-core";
import { getInvitationTemplateCreateHref } from "@/lib/invitation-template-marketplace-routes";

type UiState =
  | { kind: "working" }
  | { kind: "not-found"; template: string }
  | { kind: "failed"; result: Extract<PromoteLocalDraftResult, { ok: false; reason: "promotion-failed" }> };

function PromoteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId") ?? "";
  const template = searchParams.get("template") || "minimalism-dark-blue";

  const [state, setState] = useState<UiState>({ kind: "working" });
  // React Strict Mode double-invokes effects in dev; promotion must run at
  // most once per mount regardless, since it's a real mutation.
  const ranRef = useRef(false);

  async function run() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?redirect=${encodeURIComponent(here)}`);
      return;
    }

    if (!isValidLocalDraftId(draftId)) {
      setState({ kind: "not-found", template });
      return;
    }

    const result = await promoteLocalDraft(draftId, session.user.id);
    if (result.ok) {
      router.replace(`/dashboard/events/${result.eventId}/invitation-page?edit=1`);
      return;
    }
    if (result.reason === "not-found") {
      setState({ kind: "not-found", template });
      return;
    }
    setState({ kind: "failed", result });
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void run();
    // run() closes over draftId/template/session at mount time; a param
    // change should not silently retry against stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    ranRef.current = false;
    setState({ kind: "working" });
    ranRef.current = true;
    void run();
  }

  if (state.kind === "not-found") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm font-semibold text-zinc-900">
          We couldn&apos;t find your draft on this device. If you signed up in another browser, log in in the browser where you started.
        </p>
        <a
          href={getInvitationTemplateCreateHref(state.template)}
          className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
        >
          Start a new invitation
        </a>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm font-semibold text-red-700">
          {state.result.error ?? "Could not publish your invitation."}
        </p>
        <p className="text-xs text-zinc-500">
          {state.result.step === "event" && "Could not create the event."}
          {state.result.step === "basics" && "The event was created, but your event details could not be saved."}
          {state.result.step === "draft" && "The event was created, but your invitation content could not be saved."}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-orange-600" />
    </div>
  );
}

export default function InvitationPromotePage() {
  return (
    <Suspense>
      <PromoteInner />
    </Suspense>
  );
}
