import { connection } from "next/server";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getPublishedInvitationPage } from "@/lib/actions/invitation-page";
import { assembleInvitationPageData } from "@/lib/types/invitation-page-snapshot";
import { SharedUnavailable } from "./SharedUnavailable";

export const metadata: Metadata = {
  title: "Shared invitation",
  robots: { index: false, follow: false, nocache: true },
};

// This page calls `connection()` below, so every hit revalidates the token,
// the enabled flag and the published state instead of serving anything
// static. (Cache-Control: no-store is set for this path in next.config.ts
// headers; segment configs are incompatible with cacheComponents.)

function isShareToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/**
 * General share link (Round 3 COMMIT 3): the invitation read-only, with no
 * guest name, no RSVP controls and no QR. Guest-only blocks render as a
 * neutral note (templates' `shared` mode). Anything disabled, unpublished,
 * invalid or non-invitation-kind lands on the same neutral page, which
 * reveals nothing about whether the event exists.
 */
export default async function SharedInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;

  if (!isShareToken(token)) return <SharedUnavailable />;

  // Per-IP rate limit (fail-open: limiter outages never block genuine reads).
  let rateLimited = false;
  try {
    const ip = clientIp({ headers: await headers() } as Request);
    const gate = await checkRateLimit("invitationShareView", `ip:${ip}`);
    rateLimited = !gate.allowed;
  } catch {
    /* fail open */
  }
  if (rateLimited) return <SharedUnavailable />;

  const admin = createSupabaseAdmin();
  const { data: pageRow } = await admin
    .from("event_invitation_pages")
    .select("event_id, page_status, share_enabled")
    .eq("share_token", token)
    .maybeSingle();

  const row = pageRow as {
    event_id?: string;
    page_status?: string | null;
    share_enabled?: boolean | null;
  } | null;

  if (!row || row.share_enabled !== true || row.page_status !== "published" || !row.event_id) {
    return <SharedUnavailable />;
  }

  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, kind, event_date, end_date, venue, city")
    .eq("id", row.event_id)
    .maybeSingle();

  const ev = event as {
    id?: string;
    title?: string | null;
    slug?: string | null;
    kind?: string | null;
    event_date?: string | null;
    end_date?: string | null;
    venue?: string | null;
    city?: string | null;
  } | null;

  // Share links exist only for invitation-kind events.
  if (!ev || ev.kind !== "invitation") return <SharedUnavailable />;

  const publishedPage = await getPublishedInvitationPage(ev.id as string);
  if (!publishedPage) return <SharedUnavailable />;

  const { getTemplateById } = await import("@/components/invitation/templates/registry");
  const registryEntry = getTemplateById(publishedPage.published_snapshot.template_id);
  if (!registryEntry) {
    console.error(
      `[SharedInvitationPage] Unknown template_id "${publishedPage.published_snapshot.template_id}" for event ${ev.id}.`
    );
    return <SharedUnavailable />;
  }

  const pageData = assembleInvitationPageData(
    publishedPage.published_snapshot,
    {
      id: ev.id as string,
      title: ev.title || "Shared Event",
      slug: ev.slug || "",
      event_date: ev.event_date || "",
      end_date: ev.end_date || null,
      venue: ev.venue || null,
      street_address: null,
      city: ev.city || null,
      latitude: null,
      longitude: null,
    },
    null,
    null,
    null
  );

  // Placeholder titles can never publish (validateForPublish rejects them),
  // so they cannot reach this page — belt and suspenders.
  if (!pageData.title || pageData.title === "Untitled invitation") {
    return <SharedUnavailable />;
  }

  const TemplateComponent = registryEntry.component;
  return <TemplateComponent data={pageData} shared />;
}
