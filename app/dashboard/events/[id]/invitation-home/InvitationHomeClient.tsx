"use client";

/**
 * Preview-first home for invitation-kind events.
 *
 * The invitation preview is the main item: the real template rendered in
 * the same chrome-free iframe as the builder preview, with a sample
 * guest, no RSVP writes, and the sample QR state labelled as sample
 * (see app/invitation/builder-preview/[eventId]).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { publishInvitationPage, unpublishInvitationPage } from "@/lib/actions/invitation-page";

type PreviewViewport = 390 | 1440;

const STATUS_STYLE: Record<string, string> = {
  Published: "bg-emerald-100 text-emerald-700",
  "Unpublished changes": "bg-amber-100 text-amber-700",
  Draft: "bg-zinc-200 text-zinc-700",
};

export function InvitationHomeClient({
  eventId,
  eventTitle,
  hasPage,
  pageStatus,
  hasUnpublishedChanges,
  draftLocale,
  rsvpCounts,
}: {
  eventId: string;
  eventTitle: string;
  hasPage: boolean;
  pageStatus: string;
  hasUnpublishedChanges: boolean;
  draftLocale: string;
  rsvpCounts: { accepted: number; declined: number; pending: number };
}) {
  const router = useRouter();
  const [viewport, setViewport] = useState<PreviewViewport>(390);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareNotice, setShareNotice] = useState("");

  const status =
    pageStatus === "published" && !hasUnpublishedChanges
      ? "Published"
      : pageStatus === "published"
        ? "Unpublished changes"
        : "Draft";

  async function handlePublishToggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        pageStatus === "published"
          ? await unpublishInvitationPage(eventId)
          : await publishInvitationPage(eventId, (draftLocale as "en" | "fr") || "en");
      if (!result.ok) {
        setError(result.error ?? "Could not update publish state.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update publish state.");
    } finally {
      setBusy(false);
    }
  }

  function handleCopyLink() {
    // Commit 3 wires the general share link here. Until then the host is
    // told plainly that sharing is off and where to enable it.
    setShareNotice("The share link is off. Enable sharing to get a link anyone can open.");
  }

  const builderHref = `/dashboard/events/${eventId}/invitation-page`;
  const guestsHref = `/dashboard/events/${eventId}/guests`;
  const seatingHref = `/dashboard/events/${eventId}/seating`;

  return (
    <div className="space-y-6" data-testid="invitation-home">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-violet-600">Invitation event</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{eventTitle}</h1>
          <span
            data-testid="page-status"
            className={cn(
              "mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-black uppercase",
              STATUS_STYLE[status]
            )}
          >
            {status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={builderHref}
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700"
          >
            Edit
          </Link>
          <Link
            href={guestsHref}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50"
          >
            Send
          </Link>
          <button
            type="button"
            data-testid="copy-link"
            onClick={handleCopyLink}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={handlePublishToggle}
            disabled={busy}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy ? "Working…" : pageStatus === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {shareNotice && (
        <p
          data-testid="share-prompt"
          className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800"
        >
          {shareNotice}
        </p>
      )}

      {!hasPage ? (
        <div
          data-testid="no-page-cta"
          className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center"
        >
          <p className="text-xl font-black text-zinc-950">No invitation page yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium text-zinc-500">
            Choose a template and build the invitation — title, date and venue are collected in the
            form.
          </p>
          <Link
            href={builderHref}
            className="mt-6 inline-block rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700"
          >
            Choose a template & start building
          </Link>
        </div>
      ) : (
        <section aria-label="Invitation preview">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-zinc-500">
              Guest preview — sample guest, sample QR, no RSVP writes.
            </p>
            <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1">
              {([390, 1440] as PreviewViewport[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setViewport(w)}
                  aria-pressed={viewport === w}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-black",
                    viewport === w ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"
                  )}
                >
                  {w === 390 ? "Mobile" : "Desktop"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-100 p-4">
            <iframe
              data-testid="invitation-preview"
              title="Invitation preview"
              src={`/invitation/builder-preview/${eventId}`}
              style={{ width: viewport }}
              className="mx-auto block h-[640px] max-w-none rounded-xl border border-zinc-200 bg-white"
            />
          </div>
        </section>
      )}

      <section aria-label="Event tools">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href={guestsHref}
            className="rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="text-sm font-black">Guests</p>
            <p data-testid="rsvp-counts" className="mt-1 text-xs font-semibold text-zinc-500">
              {rsvpCounts.accepted} accepted · {rsvpCounts.pending} pending · {rsvpCounts.declined} declined
            </p>
          </Link>
          <Link
            href={seatingHref}
            className="rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="text-sm font-black">Seating</p>
            <p className="mt-1 text-xs font-semibold text-zinc-500">Assign seats to invited guests</p>
          </Link>
          <Link
            href={builderHref}
            className="rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="text-sm font-black">Edit invitation</p>
            <p className="mt-1 text-xs font-semibold text-zinc-500">Template, form and side preview</p>
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["Team", "team"],
            ["Operations", "operations"],
            ["Check-ins", "checkins"],
            ["Scan", "scan"],
          ].map(([label, tab]) => (
            <Link
              key={tab}
              href={`/dashboard/events/${eventId}/${tab}`}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
