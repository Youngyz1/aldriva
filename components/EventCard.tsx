"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeImageUrl } from "@/lib/image-url";
import { getEventPlaceholder } from "@/lib/event-placeholder";
import { useAuthStatus } from "@/hooks/use-auth-status";

type EventCardProps = {
  title: string;
  date: string;
  location: string;
  /** Raw uploaded banner URL. Empty/missing/broken → deterministic placeholder. */
  image: string;
  slug: string | null;
  badge?: string;
  price?: string | null;
  category?: string | null;
  variant?: "default" | "homepage" | "compact";
  /** Raw event date (ISO). When it's in the past, the card shows a muted "Past"
   *  label and hides the price (you can't buy tickets to a past event). */
  eventDate?: string | null;
  /** Save/heart toggle in the top-right corner. On by default. */
  showSave?: boolean;
  /** Restyle for a dark background: transparent body, rounded image tile,
   *  light title/location text (used inside the dark /events hero). */
  onDark?: boolean;
};

export default function EventCard({
  title,
  date,
  location,
  image,
  slug,
  badge,
  price,
  category,
  variant = "default",
  eventDate,
  showSave = true,
  onDark = false,
}: EventCardProps) {
  const router = useRouter();
  const compact = variant === "compact";
  const isPast = eventDate ? new Date(eventDate).getTime() < Date.now() : false;

  // A normalized, allowed-host URL can still fail at runtime (dead link, 403);
  // on error (or when there's no image at all) fall back to a deterministic
  // color-block/gradient placeholder rather than an unrelated stock photo.
  const [imageSrc] = useState(() => normalizeImageUrl(image, ""));
  const [imageFailed, setImageFailed] = useState(false);
  const usePlaceholder = !imageSrc || imageFailed;
  const placeholder = usePlaceholder ? getEventPlaceholder({ title, category }) : null;

  const isAuthenticated = useAuthStatus();
  const [saved, setSaved] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  function toggleSave(event: React.MouseEvent) {
    // The card is wrapped in a link — keep the heart from navigating.
    event.preventDefault();
    event.stopPropagation();
    if (isAuthenticated === true) {
      // NOTE: local UI state only — there is no saved-events table yet.
      // Persisting real saves needs a new table + endpoint (follow-up).
      setSaved((value) => !value);
      return;
    }
    // Logged-out (or status not yet known): prompt to log in, non-blocking.
    setShowLoginPrompt(true);
    window.setTimeout(() => setShowLoginPrompt(false), 2800);
  }

  const card = (
    <article
      className={cn(
        "group transition hover:-translate-y-0.5",
        onDark
          ? "rounded-2xl"
          : "overflow-hidden rounded-2xl border border-zinc-200 bg-white hover:shadow-lg",
        compact && "rounded-xl"
      )}
    >
      <div
        className={cn(
          "relative w-full bg-zinc-100",
          compact ? "h-36" : "h-44 sm:h-52",
          onDark && "overflow-hidden rounded-2xl"
        )}
      >
        {usePlaceholder && placeholder ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: placeholder.background }}
          >
            <span className="px-4 text-center text-sm font-black uppercase tracking-wide text-white/90 drop-shadow-sm">
              {category || "Event"}
            </span>
          </div>
        ) : (
          <Image
            src={imageSrc}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
            onError={() => setImageFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

        {(isPast || badge) && (
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {isPast && (
              <span className="rounded-full bg-zinc-800/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow backdrop-blur">
                Past
              </span>
            )}
            {badge && (
              <span className="rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow">
                {badge}
              </span>
            )}
          </div>
        )}

        {/* Save / heart toggle */}
        {showSave && (
          <button
            type="button"
            onClick={toggleSave}
            aria-label={saved ? "Remove from saved" : "Save event"}
            aria-pressed={saved}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-orange-600"
          >
            <Heart className={cn("h-4 w-4", saved && "fill-orange-500 text-orange-500")} />
          </button>
        )}

        {/* Non-blocking "log in to save" prompt for logged-out visitors */}
        {showLoginPrompt && (
          <div className="absolute right-3 top-12 z-10 flex items-center gap-2 rounded-lg bg-zinc-900/95 px-3 py-2 text-[11px] font-bold text-white shadow-lg">
            <span>Log in to save</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push("/login");
              }}
              className="rounded-md bg-orange-600 px-2 py-0.5 font-black text-white hover:bg-orange-700"
            >
              Log in
            </button>
          </div>
        )}

        {price && !isPast && (
          <span className="absolute bottom-3 right-3 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-black text-zinc-950 shadow-sm backdrop-blur">
            {price}
          </span>
        )}
      </div>

      {/* Standardized hierarchy: real text title → date. */}
      <div className={cn(onDark ? "pt-3" : "p-4", compact && (onDark ? "pt-2.5" : "p-3"))}>
        <h3
          title={title}
          className={cn(
            "line-clamp-2 font-black leading-snug",
            onDark ? "text-white" : "text-zinc-950",
            compact ? "text-sm" : "text-base sm:text-lg"
          )}
        >
          {title}
        </h3>
        <div className="mt-1.5 flex items-center gap-2">
          <p
            className={cn(
              "text-xs font-bold uppercase tracking-wide",
              onDark ? "text-orange-400" : "text-orange-600"
            )}
          >
            {date}
          </p>
          {category && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                onDark ? "bg-white/10 text-zinc-200" : "bg-zinc-100 text-zinc-600"
              )}
            >
              {category}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-1 line-clamp-1 text-xs font-semibold sm:text-sm",
            onDark ? "text-zinc-400" : "text-zinc-500"
          )}
        >
          {location}
        </p>
      </div>
    </article>
  );

  if (!slug) return card;
  return <Link href={`/events/${slug}`}>{card}</Link>;
}
