/**
 * app/invitation/preview/[token]/page.tsx
 *
 * Host draft preview route.
 *
 * Dynamic behaviour:
 * - No `export const dynamic` — cacheComponents compatible.
 * - The static outer shell (InvitationPreviewPage) is prerenderable: it validates
 *   the token shape and renders the Suspense boundary.
 * - PreviewLoader calls `await connection()` which opts it out of the prerender
 *   cache (same pattern as app/invitation/[token]/page.tsx).
 *
 * Security:
 * - Reads ONLY the draft (not the published snapshot) via a time-limited preview token
 *   stored in `invitation_page_preview_tokens`. The token is created by the event owner
 *   or organizer via createOrRegeneratePreviewToken(), never via a guest invitation row.
 * - Expired or invalid tokens receive a friendly error message (EN/FR).
 * - noindex + Cache-Control: no-store + referrer: no-referrer.
 * - RSVP buttons are disabled — no RSVP writes are possible.
 * - The guest shown is a sample ("Preview Guest") with a placeholder QR code.
 * - This route DOES NOT create or touch any event_invitations row.
 */

import { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { Eye, Clock, MailX } from "lucide-react";
import { getInvitationPagePreviewByToken } from "@/lib/actions/invitation-page";
import { assembleInvitationPageData } from "@/lib/types/invitation-page-snapshot";
import { BRAND } from "@/config/branding";
import type { InvitationPageData } from "@/types/invitation-template";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Draft Preview | ${BRAND.name}`,
    description: "Host draft preview — not publicly accessible.",
    robots: { index: false, follow: false, nocache: true },
    other: { referrer: "no-referrer" },
  };
}

// ── Static outer shell ────────────────────────────────────────────────────────
// Token shape is validated here without any I/O so this component is safe to
// prerender. All data fetching is delegated to PreviewLoader behind <Suspense>.

export default async function InvitationPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Token shape check — 64 hex characters. No I/O here.
  if (!token || typeof token !== "string" || token.length !== 64) {
    return <PreviewErrorView reason="invalid" />;
  }

  return (
    <Suspense fallback={<PreviewLoadingView />}>
      <PreviewLoader token={token} />
    </Suspense>
  );
}

// ── Dynamic data component ────────────────────────────────────────────────────
// `connection()` opts this out of the prerender cache: draft data is mutable
// (token can expire, draft can change) and must never be served stale.

async function PreviewLoader({ token }: { token: string }) {
  // Must be first — opts this subtree out of the component cache.
  await connection();

  const result = await getInvitationPagePreviewByToken(token);

  if (!result.valid) {
    return <PreviewErrorView reason={result.reason} />;
  }

  const { draft, event } = result;

  // Build InvitationPageData from the draft (not the published snapshot).
  // Draft fields map the same as snapshot fields — synthesise a snapshot object
  // from the draft row for assembly purposes.
  const draftAsSnapshot = {
    template_id: draft.template_id,
    locale: draft.locale,
    display_title: draft.display_title,
    eyebrow: draft.eyebrow,
    host_names: draft.host_names,
    story_headline: draft.story_headline,
    story_text: draft.story_text,
    story_image_url: draft.story_image_url,
    hero_image_url: draft.hero_image_url,
    hero_image_alt: draft.hero_image_alt,
    hero_image_focus_x: draft.hero_image_focus_x ?? 50,
    hero_image_focus_y: draft.hero_image_focus_y ?? 50,
    scroll_prompt: draft.scroll_prompt,
    venue_name: draft.venue_name,
    address: draft.address,
    parking_notes: draft.parking_notes,
    timezone: draft.timezone || "UTC",
    dress_code: draft.dress_code,
    dress_code_notes: draft.dress_code_notes,
    additional_notes: draft.additional_notes,
    hashtag: draft.hashtag,
    music_audio_url: draft.music_audio_url,
    music_title: draft.music_title,
    partner1_name: draft.partner1_name,
    partner2_name: draft.partner2_name,
    family_note: draft.family_note,
    wedding_subtype: draft.wedding_subtype,
    registry_note: draft.registry_note,
    celebrant_name: draft.celebrant_name,
    age_milestone: draft.age_milestone,
    theme: draft.theme,
    gift_note: draft.gift_note,
    schedule: draft.schedule,
    gallery: draft.gallery,
    venues: draft.venues,
    accommodations: draft.accommodations,
    colors_of_the_day: draft.colors_of_the_day,
    wedding_story: draft.wedding_story,
  };

  // Sample guest — no real PII, placeholder QR.
  const sampleGuest = {
    guest_name: "Preview Guest",
    guest_title: null,
    organization: null,
    rsvp_status: "pending" as const,
    rsvp_at: null,
    token: "preview-sample-token",
    is_vip: false,
  };
  const sampleTicket = {
    qr_code: "PREVIEW-QR-PLACEHOLDER",
    status: "valid",
    checked_in_at: null,
  };

  const pageData: InvitationPageData = assembleInvitationPageData(
    draftAsSnapshot,
    event,
    sampleGuest,
    sampleTicket,
    null
  );

  // Resolve template from registry
  const { getTemplateById } = await import("@/components/invitation/templates/registry");
  const registryEntry = getTemplateById(draft.template_id);
  const TemplateComponent = registryEntry.component;

  return (
    <>
      {/* Preview Banner — shown above the template, not part of it */}
      <PreviewBanner expiresAt={result.expiresAt} locale={draft.locale} />
      {/*
        onRsvp is intentionally omitted so the template disables its RSVP buttons.
        No RSVP writes are possible from the preview route.
      */}
      <TemplateComponent data={pageData} />
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PreviewLoadingView() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 h-16 w-16 animate-pulse rounded-2xl border border-zinc-700 bg-zinc-800" />
        <div className="mx-auto h-5 w-40 animate-pulse rounded-lg bg-zinc-800" />
        <div className="mx-auto mt-3 h-3.5 w-56 animate-pulse rounded-lg bg-zinc-800/70" />
      </div>
    </main>
  );
}

function PreviewBanner({ expiresAt, locale }: { expiresAt: string; locale: "en" | "fr" }) {
  const isFr = locale === "fr";
  const expiryDate = new Date(expiresAt).toLocaleDateString(isFr ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="sticky top-0 z-50 w-full bg-amber-500 text-zinc-900 shadow-lg"
      role="banner"
      aria-label={isFr ? "Mode prévisualisation" : "Preview mode"}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Eye size={16} className="shrink-0" />
          <span>
            {isFr
              ? "PRÉVISUALISATION — Ce lien est uniquement visible par vous. Les invités ne voient pas cette page tant qu'elle n'est pas publiée."
              : "PREVIEW — This link is visible to you only. Guests will not see this page until you publish it."}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold opacity-80">
          <Clock size={13} />
          <span>
            {isFr ? `Expire le ${expiryDate}` : `Expires ${expiryDate}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function PreviewErrorView({ reason }: { reason: "invalid" | "expired" }) {
  const isExpired = reason === "expired";

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-400">
          {isExpired ? <Clock size={28} /> : <MailX size={28} />}
        </div>
        <h1 className="text-xl font-black text-white">
          {isExpired ? "Preview Link Expired" : "Invalid Preview Link"}
        </h1>
        <p className="mt-2 text-sm font-medium text-zinc-400 leading-relaxed">
          {isExpired
            ? "This preview link has expired. Generate a new one from your event dashboard."
            : "This preview link is invalid or has already been used."}
        </p>
        {/* FR */}
        <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
          {isExpired
            ? "Ce lien de prévisualisation a expiré. Générez-en un nouveau depuis votre tableau de bord."
            : "Ce lien de prévisualisation est invalide ou a déjà été utilisé."}
        </p>
        <div className="mt-6 pt-6 border-t border-zinc-800">
          <Link
            href="/dashboard"
            className="inline-block rounded-xl bg-zinc-800 px-5 py-2.5 text-xs font-black text-zinc-200 hover:bg-zinc-700 transition-all"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
