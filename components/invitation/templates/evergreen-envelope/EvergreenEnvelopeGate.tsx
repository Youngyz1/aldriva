"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

type GateStage = "closed" | "seal-press" | "flap-opening" | "cards-rising" | "crossfade" | "complete";
type GateCard = {
  type: "photo" | "text";
  photo?: string | null;
  photoAlt?: string;
  photoFocus?: { x: number; y: number } | null;
  title?: string | null;
  body?: string | null;
  reservedName?: string | null;
  guestAllowance?: number | null;
  sample?: boolean;
};

/** Original envelope artwork. Opening only reveals the already-mounted cover; it never changes RSVP state. */
export function EvergreenEnvelopeGate({
  title,
  names,
  eventDate,
  intro,
  heading,
  monogram,
  cards,
  coverPhoto,
  paperTint,
  paperInk,
  paperAccent,
  onRevealCover,
}: {
  title: string;
  names: string;
  eventDate: string;
  intro: string;
  heading: string;
  monogram?: string | null;
  cards: [GateCard, GateCard];
  coverPhoto?: string | null;
  paperTint: string;
  paperInk: string;
  paperAccent: string;
  onRevealCover: () => void;
}) {
  const t = useTranslations("Events");
  const [stage, setStage] = useState<GateStage>("closed");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const revealed = useRef(false);
  const displayCards = useMemo(() => cards, [cards]);
  const photoSources = useMemo(() => [...new Set([
    ...(coverPhoto ? [coverPhoto] : []),
    ...displayCards.filter((card) => card.type === "photo").map((card) => card.photo).filter((photo): photo is string => Boolean(photo)),
  ])], [coverPhoto, displayCards]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  // Decode the images before making the seal active; after 1.5s, let the guest open regardless.
  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => setImagesReady(true), 1500);
    void Promise.allSettled(photoSources.map((src) => new Promise<void>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = src;
      if (typeof image.decode === "function") void image.decode().then(resolve, resolve);
      else if (image.complete) resolve();
    }))).then(() => {
      if (!cancelled) setImagesReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [photoSources]);

  useEffect(() => {
    if (stage === "seal-press") {
      const timer = window.setTimeout(() => setStage("flap-opening"), 180);
      return () => window.clearTimeout(timer);
    }
    if (stage === "flap-opening") {
      const timer = window.setTimeout(() => setStage("cards-rising"), 700);
      return () => window.clearTimeout(timer);
    }
    if (stage === "cards-rising") {
      // Begin the cover crossover at about two thirds of the cards' rise.
      const timer = window.setTimeout(() => setStage("crossfade"), 470);
      return () => window.clearTimeout(timer);
    }
    if (stage === "crossfade") {
      if (!revealed.current) {
        revealed.current = true;
        onRevealCover();
      }
      const timer = window.setTimeout(() => setStage("complete"), reducedMotion ? 180 : 800);
      return () => window.clearTimeout(timer);
    }
  }, [onRevealCover, reducedMotion, stage]);

  function openFromSeal(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!imagesReady || stage !== "closed") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReducedMotion(true);
      setStage("crossfade");
      return;
    }
    setStage("seal-press");
  }

  function skipOpening() {
    if (stage === "closed" || stage === "complete") return;
    setStage("crossfade");
  }

  const isClosed = stage === "closed";
  const isCrossfade = stage === "crossfade" || stage === "complete";
  const flapOpen = stage === "flap-opening" || stage === "cards-rising" || isCrossfade;
  const duration = reducedMotion ? 180 : 800;

  return (
    <section
      aria-label={t("evergreenGateAria", { title })}
      aria-hidden={stage === "complete"}
      inert={stage === "complete"}
      data-evergreen-envelope-stage={stage}
      data-evergreen-gate="true"
      onClick={skipOpening}
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-6 text-center"
      style={{ color: paperInk, pointerEvents: stage === "complete" ? "none" : "auto" }}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity ease-out ${isCrossfade ? "opacity-0" : "opacity-100"}`}
        style={{ backgroundColor: paperTint, transitionDuration: `${duration}ms` }}
      >
        <svg className="absolute inset-0 h-full w-full opacity-[.13]" aria-hidden="true">
          <filter id="evergreen-paper-grain">
            <feTurbulence type="fractalNoise" baseFrequency=".74" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#evergreen-paper-grain)" opacity=".34" />
        </svg>
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(ellipse at 50% 25%, rgba(255,255,255,.72), transparent 58%), repeating-linear-gradient(0deg, rgba(72,59,38,.025) 0 1px, transparent 1px 5px)" }} />
      </div>

      <div
        className="absolute inset-0 z-10"
        style={{ transform: isCrossfade ? "translateY(-16px)" : "translateY(0)", opacity: isCrossfade ? 0 : 1, transitionProperty: "transform, opacity", transitionDuration: `${duration}ms`, transitionTimingFunction: "cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="absolute inset-x-4 top-[7svh] z-50 mx-auto flex w-full max-w-3xl flex-col items-center px-2">
          <p className="font-serif text-[.65rem] uppercase leading-5 tracking-[.2em] sm:text-xs">{intro}</p>
          <h1 className="mt-2 max-w-full break-words font-script text-4xl leading-none sm:text-6xl" style={{ color: paperAccent }}>{heading}</h1>
          <p className="mt-2 max-w-full break-words font-serif text-xl tracking-[.11em] sm:text-2xl">{names}</p>
        </div>

        <div className="absolute inset-0" style={{ perspective: "1100px" }}>
          {/* Cards are mounted before the tap and start behind the full-screen envelope pocket. */}
          {displayCards.map((card, index) => {
            const photoCard = card.type === "photo";
            const visible = stage === "cards-rising";
            const customText = Boolean(card.title?.trim() || card.body?.trim());
            const reserved = Boolean(card.reservedName);
            const emptyLiveText = !customText && !reserved && !card.sample;
            const hidden = !visible || (card.type === "photo" && !card.photo) || (card.type === "text" && emptyLiveText);
            return (
              <article
                key={index}
                data-evergreen-gate-card={index + 1}
                aria-hidden={hidden}
                className={`absolute bottom-[14%] z-20 flex h-[min(38svh,20rem)] w-[42%] max-h-[20rem] flex-col items-center justify-center overflow-hidden border border-[#d6cfbc] bg-[#fffdf7] p-3 text-center text-[#46513a] shadow-[0_8px_18px_rgba(44,40,29,.2)] ${index === 0 ? "left-[6%]" : "right-[6%]"}`}
                style={{
                  transform: `translateY(${reducedMotion ? "0" : visible ? "-38%" : isCrossfade ? "-52%" : "112%"}) rotate(${index === 0 ? "-4deg" : "3deg"})`,
                  opacity: visible ? 1 : 0,
                  transitionProperty: "transform, opacity",
                  transitionDuration: `${reducedMotion ? 180 : 720}ms`,
                  transitionDelay: visible && index === 1 ? "150ms" : "0ms",
                  transitionTimingFunction: "cubic-bezier(.16,1,.3,1)",
                }}
              >
                {photoCard ? (
                  card.photo ? (
                    <Image
                      src={card.photo}
                      alt={card.photoAlt ?? ""}
                      width={480}
                      height={640}
                      sizes="42vw"
                      unoptimized
                      priority
                      loading="eager"
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: card.photoFocus ? `${card.photoFocus.x}% ${card.photoFocus.y}%` : "50% 50%" }}
                    />
                  ) : null
                ) : (
                  <>
                    {card.sample ? <span className="mb-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 font-sans text-[.55rem] font-bold uppercase tracking-wide text-amber-900">{t("evergreenSampleBadge")}</span> : null}
                    <h2 className="font-serif text-xs font-semibold leading-4 sm:text-base">{card.title?.trim() || (reserved ? t("evergreenReservedFor") : card.sample ? t("evergreenCardSampleTitle") : "")}</h2>
                    {reserved ? <p className="mt-1 break-words font-script text-base leading-tight sm:text-xl">{card.reservedName}</p> : null}
                    {reserved && card.guestAllowance != null ? <p className="mt-1 font-serif text-[.6rem] sm:text-xs">{t("evergreenGuestAllowance", { count: card.guestAllowance })}</p> : null}
                    {card.body?.trim() ? <p className="mt-1 whitespace-pre-line break-words font-serif text-[.65rem] leading-4 sm:text-sm">{card.body}</p> : null}
                    {!reserved && !customText && card.sample ? <p className="mt-1 font-serif text-[.65rem] leading-4 sm:text-sm">{t("evergreenCardSampleBody")}</p> : null}
                  </>
                )}
                {photoCard && card.sample ? <span className="absolute right-2 top-2 rounded-full border border-amber-400 bg-amber-50/95 px-2 py-0.5 font-sans text-[.55rem] font-bold uppercase tracking-wide text-amber-900">{t("evergreenSampleBadge")}</span> : null}
              </article>
            );
          })}

          {/* Full-viewport envelope back with original V-folds. */}
          <div className="absolute inset-0 z-10 overflow-hidden border-y border-[#d4c8ae]/80 shadow-[inset_0_0_34px_rgba(56,46,28,.12)]" style={{ backgroundColor: paperTint }}>
            <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(135deg,rgba(255,255,255,.56),rgba(218,203,174,.2)), repeating-linear-gradient(135deg,rgba(92,72,42,.04) 0 1px,transparent 1px 8px)" }} />
            <svg viewBox="0 0 100 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
              <path d="M0 0 50 605 100 0" stroke="rgba(100,78,49,.34)" strokeWidth=".55" vectorEffect="non-scaling-stroke" />
              <path d="M0 1000 50 600 100 1000" stroke="rgba(255,255,255,.76)" strokeWidth=".8" vectorEffect="non-scaling-stroke" />
              <path d="M0 0 50 605 100 0M0 1000 50 600 100 1000" stroke="rgba(109,86,56,.10)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div
            aria-hidden="true"
            data-evergreen-envelope-flap="true"
            className="absolute inset-x-0 top-0 z-30 h-[61%] origin-top transition-transform ease-out"
            style={{ background: `linear-gradient(155deg,${paperTint}, color-mix(in srgb, ${paperTint} 80%, #d6c7a8))`, clipPath: "polygon(0 0,100% 0,50% 100%)", transform: flapOpen ? "rotateX(-178deg)" : "rotateX(0deg)", transitionDuration: reducedMotion ? "0ms" : flapOpen ? "820ms" : "0ms", backfaceVisibility: "hidden", boxShadow: "0 12px 16px rgba(63,49,28,.18)" }}
          />
          {/* Front pocket masks the lower card edges and remains above both cards. */}
          <div data-evergreen-envelope-pocket="true" className="absolute inset-x-0 bottom-0 z-40 h-[42%] overflow-hidden" style={{ clipPath: "polygon(0 0,50% 33%,100% 0,100% 100%,0 100%)", background: `linear-gradient(145deg,${paperTint}, color-mix(in srgb, ${paperTint} 87%, ${paperAccent}))`, boxShadow: "inset 0 1px rgba(255,255,255,.72), 0 -7px 12px rgba(75,58,34,.08)" }}>
            <svg viewBox="0 0 100 420" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
              <path d="M0 0 50 139 100 0" stroke="rgba(105,83,52,.20)" strokeWidth=".7" vectorEffect="non-scaling-stroke" />
              <path d="M0 420 50 139 100 420" stroke="rgba(255,255,255,.62)" strokeWidth=".7" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>

          <div className="absolute inset-x-3 bottom-[2.5svh] z-[60] text-center">
            <p className="font-serif text-[.65rem] uppercase tracking-[.2em] sm:text-xs">{eventDate}</p>
            <p className="mt-1 font-serif text-xs italic tracking-wide">{t("evergreenTapSealToOpen")}</p>
          </div>

          <button
            type="button"
            data-evergreen-seal="true"
            onClick={openFromSeal}
            disabled={!imagesReady || !isClosed}
            aria-label={t("evergreenOpenInvitation")}
            aria-disabled={!imagesReady || !isClosed}
            aria-busy={!imagesReady}
            className="absolute left-1/2 top-[60.5%] z-50 grid size-[7.5rem] place-items-center rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-950 disabled:cursor-wait"
            style={{ transform: `translate(-50%, -50%) scale(${stage === "seal-press" ? 0.94 : 1})`, opacity: isClosed ? imagesReady ? 1 : 0.64 : 0, transitionProperty: "transform, opacity", transitionDuration: "180ms", transitionTimingFunction: "ease-out" }}
          >
            <svg viewBox="0 0 120 120" className="h-[min(26vw,7.25rem)] w-[min(26vw,7.25rem)] min-h-[5.5rem] min-w-[5.5rem] drop-shadow-[0_8px_9px_rgba(52,39,17,.3)]" aria-hidden="true">
              <defs>
                <radialGradient id="evergreen-gold-wax" cx="31%" cy="24%" r="84%"><stop stopColor="#fff0b4"/><stop offset=".38" stopColor="#d8b55e"/><stop offset=".72" stopColor="#ae8132"/><stop offset="1" stopColor="#79551f"/></radialGradient>
                <linearGradient id="evergreen-gold-edge" x1="13" y1="9" x2="102" y2="111"><stop stopColor="#fff1b6"/><stop offset=".46" stopColor="#c29641"/><stop offset="1" stopColor="#75501c"/></linearGradient>
              </defs>
              <path d="M59 4c6 0 9 5 14 7 5 2 11-2 15 2 4 4 2 10 5 15 3 5 10 6 11 12 2 6-4 10-4 16s6 11 4 17c-1 5-8 7-11 12-3 5-1 12-5 15-4 4-10 0-15 2-5 2-8 7-14 7s-9-5-14-7c-5-2-11 2-15-2-4-3-2-10-5-15-3-5-10-7-11-12-2-6 4-11 4-17s-6-10-4-16c1-6 8-7 11-12 3-5 1-11 5-15 4-4 10 0 15-2 5-2 8-7 14-7Z" fill="url(#evergreen-gold-wax)" stroke="url(#evergreen-gold-edge)" strokeWidth="3"/>
              <circle cx="59" cy="60" r="37" fill="#c99f4b" fillOpacity=".22" stroke="#fff0b2" strokeOpacity=".94" strokeWidth="2"/>
              <circle cx="59" cy="60" r="31" stroke="#8e682a" strokeOpacity=".68" strokeWidth="1.4"/>
              <path d="M43 82c-9-8-13-17-12-29m1 16c5-3 9-3 14 0m-12-9c5-3 8-8 9-14m-5 24c5-1 9 1 12 5m-9-22c5-1 8-4 10-9m41 38c9-8 13-17 12-29m-1 16c-5-3-9-3-14 0m12-9c-5-3-8-8-9-14m5 24c-5-1-9 1-12 5m9-22c-5-1-8-4-10-9" stroke="#fff0b2" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="47" cy="50" r="2" fill="#fff0b2"/><circle cx="72" cy="50" r="2" fill="#fff0b2"/><circle cx="47" cy="70" r="2" fill="#fff0b2"/><circle cx="72" cy="70" r="2" fill="#fff0b2"/>
              {monogram?.trim() ? <text x="59" y="65" textAnchor="middle" fill="#fff7d9" fontSize="18" fontFamily="serif" fontStyle="italic">{monogram.trim().slice(0, 8)}</text> : <path d="M59 49v22m-8-14 8-8 8 8m-16 10 8 8 8-8" stroke="#fff5cf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
