import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface ProfileHeaderProps {
  name: string;
  avatarUrl?: string | null;
  /** Initials/letter shown when there's no avatar image. */
  avatarFallback: string;
  avatarShape?: "circle" | "square";
  /** Verification/type/rating badges — a generic slot, not tied to any one profile type. */
  badges?: React.ReactNode;
  tagline?: string | null;
  /** Follow / Share / Edit — a generic slot, so this stays usable for any profile type. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Compact profile header shared by every profile type — no banner. Avatar,
 * name, a generic badge row, a one-line tagline, and a generic actions slot.
 */
export default function ProfileHeader({
  name,
  avatarUrl,
  avatarFallback,
  avatarShape = "circle",
  badges,
  tagline,
  actions,
  className,
}: ProfileHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex items-start gap-4">
        <Avatar
          className={cn(
            "h-16 w-16 shrink-0 ring-1 ring-zinc-200 sm:h-20 sm:w-20",
            avatarShape === "square" ? "rounded-2xl" : "rounded-full"
          )}
        >
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className={cn("text-xl sm:text-2xl", avatarShape === "square" && "rounded-2xl")}>
            {avatarFallback}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 pt-1">
          {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
          <h1 className="mt-1 truncate text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">
            {name}
          </h1>
          {tagline && (
            <p className="mt-1 max-w-xl text-sm font-medium text-zinc-500 line-clamp-2">{tagline}</p>
          )}
        </div>
      </div>

      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
