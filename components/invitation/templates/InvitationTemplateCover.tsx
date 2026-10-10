"use client";

/**
 * components/invitation/templates/InvitationTemplateCover.tsx
 *
 * Invitation Page Template — "Cover Story" (Round 5, step 3).
 * Full-bleed event hero with LIVE text in a solid dark panel: title, host
 * names, date, venue, short message. Readability comes from a brightness
 * filter on the photo plus the solid panel — no gradient scrim (design
 * rules). No hero → solid palette fallback with the same live text.
 *
 * Same contract as every template: InvitationPageData in, standard
 * section anchors (inv-hero/inv-story/inv-details/inv-schedule/
 * inv-gallery/rsvp-section), guest-only blocks collapse to SharedNote in
 * shared mode, HIDE-IF-EMPTY sections vanish from the DOM.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { InvitationPageData } from "@/types/invitation-template";
import {
  formatLocalizedEventDate,
  getInvitationDictionary,
  type InvitationLocale,
} from "@/lib/invitation-i18n";
import { InvitationGalleryGrid } from "@/components/invitation/InvitationGalleryGrid";
import { SharedNote } from "@/components/invitation/SharedNote";
import { cn } from "@/lib/utils";

const FF_DISPLAY = "Georgia, serif";
const FF_TEXT = "var(--font-sans), sans-serif";

// Panel text on near-black: white 15.7:1, zinc-200 12.4:1, amber-200 12.6:1
// (worst case: white photo under brightness(.72) beneath bg-zinc-950/85,
// computed 2026-10-09). All clear WCAG AA (4.5:1); body text clears AAA.
const PANEL = "bg-zinc-950/85 text-white";

interface Props {
  data: InvitationPageData;
  onRsvp?: (response: "accepted" | "declined") => Promise<void>;
  className?: string;
  /** General share-link mode: guest-only blocks render as a neutral note. */
  shared?: boolean;
  previewMode?: "thumbnail";
}

function CanvasQRCode({ value, size = 160 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    import("qrcode")
      .then((QRCode) => {
        QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 1,
        });
      })
      .catch(() => {});
  }, [value, size]);
  return <canvas ref={canvasRef} aria-label="Entry QR code" />;
}

export function InvitationTemplateCover({ data, onRsvp, className = "", shared = false, previewMode }: Props) {
  const locale: InvitationLocale = data.locale || "en";
  const dict = useMemo(() => getInvitationDictionary(locale), [locale]);

  const [currentRsvp, setCurrentRsvp] = useState<"pending" | "accepted" | "declined">(
    data.guest.rsvpStatus || "pending"
  );
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpFeedback, setRsvpFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setCurrentRsvp(data.guest.rsvpStatus || "pending");
  }, [data.guest.rsvpStatus]);

  const { dateDisplay, timeDisplay } = useMemo(
    () => formatLocalizedEventDate(data.eventDate, locale, data.timezone),
    [data.eventDate, locale, data.timezone]
  );

  async function handleRsvpAction(response: "accepted" | "declined") {
    if (submittingRsvp) return;
    setSubmittingRsvp(true);
    setRsvpFeedback(null);
    try {
      if (onRsvp) {
        await onRsvp(response);
      } else {
        const res = await fetch(`/api/invitation/${data.token}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to record RSVP");
        }
      }
      setCurrentRsvp(response);
      setRsvpFeedback({
        type: "success",
        text: response === "accepted" ? dict.attendanceConfirmed : dict.responseNoted,
      });
    } catch {
      setRsvpFeedback({ type: "error", text: dict.rsvpFailed });
    } finally {
      setSubmittingRsvp(false);
    }
  }

  const heroFocus = data.heroImageFocus ?? { x: 50, y: 50 };
  const dateLine = [dateDisplay, timeDisplay].filter(Boolean).join(" · ");
  const venueLine = [data.venue, data.city].filter(Boolean).join(" · ");
  const hasSchedule = (data.schedule?.length ?? 0) > 0;
  const hasGallery = (data.gallery?.length ?? 0) > 0;

  return (
    <main
      className={cn("min-h-screen bg-[#101014] text-white", previewMode === "thumbnail" && "!min-h-0", className)}
      style={{ fontFamily: FF_TEXT }}
    >
      {/* ── Section 1: full-bleed hero + live panel ─────────────────────── */}
      <section id="inv-hero" aria-label="Event cover" className="relative w-full">
        <div className={cn("relative w-full overflow-hidden", previewMode === "thumbnail" ? "min-h-[520px]" : "min-h-[92svh]")}>
          {data.heroImage ? (
            <Image
              src={data.heroImage}
              alt={data.heroImageAlt || data.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              style={{
                objectPosition: `${heroFocus.x}% ${heroFocus.y}%`,
                filter: "brightness(0.72)",
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-[#101014]" aria-hidden />
          )}

          <div className="absolute inset-x-0 bottom-0 pb-8 sm:pb-12">
            <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
              <div className={cn("rounded-xl p-5 shadow-xs sm:p-8", PANEL)}>
                <p
                  className="text-[11px] font-bold uppercase"
                  style={{ letterSpacing: "0.3em", color: "#fcd34d" }}
                >
                  {data.eyebrow || dict.youAreInvited}
                </p>
                <h1
                  className="mt-2 line-clamp-4 text-balance break-words"
                  style={{
                    fontFamily: FF_DISPLAY,
                    fontSize: "clamp(2rem, 6vw, 3.75rem)",
                    lineHeight: 1.08,
                    fontWeight: 700,
                  }}
                >
                  {data.title}
                </h1>
                {data.hostNames && (
                  <p className="mt-2 text-sm font-semibold italic text-zinc-200">{data.hostNames}</p>
                )}
                {dateLine && (
                  <p className="mt-3 truncate text-sm font-bold tabular-nums text-white">{dateLine}</p>
                )}
                {venueLine && (
                  <p className="mt-1 truncate text-sm font-medium text-zinc-200">{venueLine}</p>
                )}
                {data.storyText && (
                  <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-zinc-200">{data.storyText}</p>
                )}
                {shared ? (
                  <div className="mt-4">
                    <SharedNote locale={locale} />
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-bold text-amber-200">
                    {data.guest.name}
                    {data.guest.title ? ` · ${data.guest.title}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: story (HIDE-IF-EMPTY beyond the hero excerpt) ────── */}
      {data.storyHeadline && (
        <section id="inv-story" aria-label="Event story" className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <h2
            className="text-xl font-bold text-white"
            style={{ fontFamily: FF_DISPLAY }}
          >
            {data.storyHeadline}
          </h2>
          {data.storyImage && (
            <span className="relative mt-4 block aspect-[16/9] w-full overflow-hidden rounded-xl">
              <Image src={data.storyImage} alt="" fill sizes="100vw" className="object-cover" />
            </span>
          )}
        </section>
      )}

      {/* ── Section 3: details (HIDE-IF-EMPTY) ──────────────────────────── */}
      {(data.address || data.parkingNotes || data.dressCode) && (
        <section id="inv-details" aria-label="Event details" className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            {data.address && (
              <p className="truncate text-sm text-zinc-200">{data.address}</p>
            )}
            {data.parkingNotes && (
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{data.parkingNotes}</p>
            )}
            {data.dressCode && (
              <p className="mt-2 text-sm font-bold text-amber-200">{data.dressCode}</p>
            )}
            {data.dressCodeNotes && (
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">{data.dressCodeNotes}</p>
            )}
          </div>
        </section>
      )}

      {/* ── Section 4: schedule (HIDE-IF-EMPTY) ─────────────────────────── */}
      {hasSchedule && (
        <section id="inv-schedule" aria-label="Event schedule" className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: FF_DISPLAY }}>
            {dict.orderOfEvents}
          </h2>
          <ol className="mt-4 space-y-3">
            {data.schedule!.map((item, i) => (
              <li key={i} className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <span className="shrink-0 text-sm font-bold tabular-nums text-amber-200">{item.time}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-white">{item.title}</span>
                  {item.description && (
                    <span className="mt-0.5 block text-sm leading-relaxed text-zinc-300">{item.description}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Section 5: gallery (HIDE-IF-EMPTY) ──────────────────────────── */}
      {hasGallery && (
        <section id="inv-gallery" aria-label="Event gallery" className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">
          <InvitationGalleryGrid images={data.gallery!} />
        </section>
      )}

      {/* ── Section 6: RSVP + entry pass ────────────────────────────────── */}
      <section id="rsvp-section" aria-label="RSVP" className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        {shared ? (
          <SharedNote locale={locale} />
        ) : (
          <div className={cn("rounded-xl p-5 sm:p-6", PANEL)}>
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: FF_DISPLAY }}>
              {dict.yourInvitationAndRsvp}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submittingRsvp}
                onClick={() => void handleRsvpAction("accepted")}
                className="rounded-xl bg-orange-700 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xs transition hover:bg-orange-800 active:scale-[0.98] disabled:opacity-60"
              >
                {submittingRsvp ? <Loader2 size={14} className="animate-spin" /> : dict.accept}
              </button>
              <button
                type="button"
                disabled={submittingRsvp}
                onClick={() => void handleRsvpAction("declined")}
                className="rounded-xl border border-white/20 bg-transparent px-5 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-200 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-60"
              >
                {dict.decline}
              </button>
            </div>
            {rsvpFeedback && (
              <p
                className={cn(
                  "mt-3 flex items-center gap-1.5 text-xs font-semibold",
                  rsvpFeedback.type === "success" ? "text-emerald-300" : "text-red-300"
                )}
              >
                {rsvpFeedback.type === "success" && <CheckCircle2 size={14} />}
                {rsvpFeedback.text}
              </p>
            )}
            {data.ticketInstance?.qrCode && currentRsvp !== "declined" && (
              <div className="mt-4 flex items-center gap-4 rounded-xl bg-white p-4 text-zinc-900">
                <CanvasQRCode value={data.ticketInstance.qrCode} size={120} />
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-500">{dict.presentForAdmission}</p>
                  <p className="mt-1 truncate text-sm font-bold">{data.guest.name}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
