import type { LucideIcon } from "lucide-react";
import { Heart, Calendar, Building2, Store, Newspaper, User, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type LocalBrandedPlaceholderVariant =
  | "fundraiser"
  | "event"
  | "organizer"
  | "avatar"
  | "business"
  | "article"
  | "banner"
  | "general";

export type LocalBrandedPlaceholderProps = {
  variant?: LocalBrandedPlaceholderVariant;
  title?: string | null;
  label?: string;
  className?: string;
  iconClassName?: string;
  /** Precomputed initials override (e.g. a single-letter or slice(0,2) legacy scheme). Falls back to getInitials(title) when omitted. Only used by variant="avatar". */
  initials?: string;
  /**
   * When set on variant="avatar", picks a deterministic color from a small
   * palette (hashed from this string) instead of the variant's default
   * gradient — preserves per-identity color differentiation (e.g. donor
   * avatars in a feed) that a single fixed color would flatten.
   */
  seed?: string;
};

type VariantConfig = {
  icon: LucideIcon;
  background: string;
  defaultLabel: string;
};

// Single source of truth for per-variant look. Adding a future variant
// (product, service, marketplace, volunteer, ...) is a config-only change.
const VARIANTS: Record<LocalBrandedPlaceholderVariant, VariantConfig> = {
  fundraiser: { icon: Heart, background: "from-orange-400 to-amber-600", defaultLabel: "Campaign" },
  event: { icon: Calendar, background: "from-amber-400 to-orange-600", defaultLabel: "Event" },
  organizer: { icon: Building2, background: "from-orange-500 to-orange-700", defaultLabel: "Organization" },
  business: { icon: Store, background: "from-amber-500 to-orange-600", defaultLabel: "Business" },
  article: { icon: Newspaper, background: "from-orange-400 to-orange-600", defaultLabel: "Article" },
  avatar: { icon: User, background: "from-orange-400 to-orange-600", defaultLabel: "" },
  banner: { icon: ImageIcon, background: "from-orange-300 to-amber-500", defaultLabel: "" },
  general: { icon: ImageIcon, background: "from-orange-300 to-amber-500", defaultLabel: "" },
};

/** Resilient initials extraction — never throws on empty/whitespace-only/single-word input. */
export function getInitials(value?: string | null): string {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

// Matches the hash-based per-name palette previously duplicated in
// DonorPopup.tsx / FundraiserSidebar.tsx, so migrating those call sites
// doesn't flatten their per-donor color differentiation.
const SEEDED_AVATAR_COLORS = [
  "bg-green-100 text-green-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
];

function getSeededAvatarClasses(seed: string): string {
  const code = (seed.trim() || "A").charCodeAt(0);
  return SEEDED_AVATAR_COLORS[code % SEEDED_AVATAR_COLORS.length];
}

export default function LocalBrandedPlaceholder({
  variant = "general",
  title,
  label,
  className,
  iconClassName,
  initials: initialsOverride,
  seed,
}: LocalBrandedPlaceholderProps) {
  const config = VARIANTS[variant] ?? VARIANTS.general;
  const Icon = config.icon;
  const displayLabel = label ?? config.defaultLabel;

  if (variant === "avatar") {
    const initials = initialsOverride ?? getInitials(title);
    const seededClasses = seed ? getSeededAvatarClasses(seed) : null;
    return (
      <div
        role="img"
        aria-label={title || "Avatar placeholder"}
        className={cn(
          "flex h-full w-full items-center justify-center font-black",
          seededClasses ?? cn("bg-gradient-to-br text-white", config.background),
          className
        )}
      >
        {initials ? (
          <span>{initials}</span>
        ) : (
          <Icon className={cn("h-1/2 w-1/2", iconClassName)} aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={title || displayLabel || "Image placeholder"}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br text-white",
        config.background,
        className
      )}
    >
      <Icon className={cn("h-8 w-8 opacity-90", iconClassName)} aria-hidden="true" />
      {displayLabel ? (
        <span className="text-xs font-bold uppercase tracking-wide opacity-90">{displayLabel}</span>
      ) : null}
    </div>
  );
}
