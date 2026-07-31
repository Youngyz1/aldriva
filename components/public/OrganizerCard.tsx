import Link from "next/link";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { CalendarDays, Heart, Users } from "lucide-react";

export type OrganizerCardData = {
  id: string;
  slug?: string | null;
  name: string;
  bio?: string | null;
  photo?: string | null;
  banner?: string | null;
  status?: string | null;
  org_type?: string | null;
  eventCount?: number;
  fundraiserCount?: number;
  followerCount?: number;
};

export default function OrganizerCard({
  organizer,
  featured = false,
}: {
  organizer: OrganizerCardData;
  featured?: boolean;
}) {
  const verified = organizer.status === "verified";
  const href = organizer.slug
    ? `/org/${organizer.slug}`
    : `/organizers/${organizer.id}`;

  const ORG_TYPE_LABELS: Record<string, string> = {
    nonprofit: "Nonprofit", business: "Business", church: "Church",
    school: "School", creator: "Creator", community: "Community",
    government: "Government", restaurant: "Restaurant",
    sports_club: "Sports Club", other: "Organization",
  };
  const orgTypeLabel = ORG_TYPE_LABELS[organizer.org_type ?? "other"] ?? "Organization";

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg ${
        featured ? "border-orange-200 ring-1 ring-orange-100" : "border-zinc-200"
      }`}
    >
      <div className="relative h-24 overflow-hidden">
        {organizer.banner ? (
          <img
            src={organizer.banner}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <LocalBrandedPlaceholder
            variant="organizer"
            label=""
            className="from-zinc-100 to-zinc-200"
            iconClassName="h-6 w-6 text-zinc-400"
          />
        )}
        {featured && (
          <span className="absolute left-3 top-3 rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
            Featured
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="-mt-10 mb-3">
          <div className="mx-auto h-16 w-16 overflow-hidden rounded-full border-4 border-white shadow-md sm:mx-0">
            {organizer.photo ? (
              <img
                src={organizer.photo}
                alt={organizer.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <LocalBrandedPlaceholder
                variant="avatar"
                title={organizer.name}
                initials={organizer.name?.charAt(0).toUpperCase() ?? ""}
                className="from-zinc-200 to-zinc-200 text-2xl text-zinc-400"
              />
            )}
          </div>
        </div>

        <div className="flex-1 text-center sm:text-left">
          <h3 className="flex items-center justify-center gap-2 text-lg font-black text-zinc-950 sm:justify-start">
            <span className="line-clamp-1">{organizer.name}</span>
            <VerifiedBadge verified={verified} size="sm" />
          </h3>
          {organizer.org_type && organizer.org_type !== "other" && (
            <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
              {orgTypeLabel}
            </span>
          )}
          <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-zinc-600">
            {organizer.bio || "Community organizer on Aldriva."}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs font-bold text-zinc-500 sm:justify-start">
            {(organizer.eventCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {organizer.eventCount} events
              </span>
            )}
            {(organizer.fundraiserCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" />
                {organizer.fundraiserCount} campaigns
              </span>
            )}
            {(organizer.followerCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {organizer.followerCount} followers
              </span>
            )}
          </div>
        </div>

        <Link
          href={href}
          className="mt-5 block w-full rounded-xl bg-zinc-950 py-3 text-center text-sm font-black text-white transition group-hover:bg-orange-600"
        >
          View profile
        </Link>
      </div>
    </article>
  );
}
