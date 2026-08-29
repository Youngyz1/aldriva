"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Building2, Gift, HeartHandshake } from "lucide-react";
import FollowButton from "@/components/profile/FollowButton";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type Organizer = {
  id: string;
  name: string | null;
  slug: string | null;
  photo: string | null;
  bio: string | null;
  status: string | null;
  verified_at: string | null;
};

type Fundraiser = {
  id: string;
  title: string;
  slug: string;
  banner: string | null;
  image_url: string | null;
  goal: number | string | null;
  raised: number | string | null;
  raised_amount: number | string | null;
  category: string | null;
  created_at: string | null;
  status?: string | null;
};

type DonationActivity = {
  id: string;
  amount: number | string | null;
  created_at: string;
  fundraiser: {
    title: string;
    slug: string;
  };
};

interface ProfileClientProps {
  profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  organizers: Organizer[];
  fundraisers: Fundraiser[];
  donations: DonationActivity[];
}

function money(value: number | string | null) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function dateLabel(value: string | null) {
  if (!value) return "Recently";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fundraiserRaised(fundraiser: Fundraiser) {
  return fundraiser.raised_amount ?? fundraiser.raised ?? 0;
}

export default function ProfileClient({
  profile,
  followerCount: initialFollowerCount,
  followingCount,
  isFollowing: initialIsFollowing,
  isOwnProfile,
  isLoggedIn,
  organizers,
  fundraisers,
  donations,
}: ProfileClientProps) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  const name = profile.display_name?.trim() || "Aldriva Member";
  const avatarInitial = name.charAt(0).toUpperCase() || "M";
  const hasActivity = organizers.length > 0 || fundraisers.length > 0 || donations.length > 0;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-orange-50"
              />
            ) : (
              <LocalBrandedPlaceholder
                variant="avatar"
                title={name}
                initials={avatarInitial}
                className="h-24 w-24 shrink-0 rounded-full from-orange-50 to-orange-50 text-3xl text-orange-700 ring-4 ring-orange-50"
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-orange-700">Public profile</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{name}</h1>
              <div className="mt-4 flex flex-wrap gap-5 text-sm">
                <div>
                  <p className="text-lg font-black text-zinc-950">{followerCount.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Followers</p>
                </div>
                <div>
                  <p className="text-lg font-black text-zinc-950">{followingCount.toLocaleString()}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Following</p>
                </div>
              </div>
            </div>

            {!isOwnProfile && (
              <div className="sm:w-44">
                <FollowButton
                  targetType="user"
                  targetId={profile.id}
                  initialIsFollowing={initialIsFollowing}
                  initialFollowerCount={initialFollowerCount}
                  isLoggedIn={isLoggedIn}
                  onChange={({ followerCount }) => setFollowerCount(followerCount)}
                  className={({ isFollowing }) =>
                    `w-full rounded-full px-5 py-2.5 text-sm font-black transition disabled:opacity-60 ${
                      isFollowing
                        ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                        : "bg-orange-600 text-white hover:bg-orange-700"
                    }`
                  }
                >
                  {({ isFollowing, pending }) => (pending ? "Saving..." : isFollowing ? "Following" : "Follow")}
                </FollowButton>
              </div>
            )}
          </div>
        </section>

        {hasActivity ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <section className="space-y-6">
              {organizers.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-orange-700" />
                    <h2 className="text-lg font-black">Organizations</h2>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {organizers.map((organizer) => (
                      <Link
                        key={organizer.id}
                        href={`/org/${organizer.slug ?? organizer.id}`}
                        className="rounded-xl border border-zinc-200 p-4 transition hover:border-orange-200 hover:bg-orange-50/30"
                      >
                        <div className="flex items-start gap-3">
                          {organizer.photo ? (
                            <img src={organizer.photo} alt="" className="h-11 w-11 rounded-xl object-cover" />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-sm font-black text-zinc-600">
                              {(organizer.name || "O").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-black text-zinc-950">{organizer.name || "Organization"}</p>
                              {(organizer.verified_at || organizer.status === "verified") && (
                                <BadgeCheck className="h-4 w-4 shrink-0 fill-sky-100 text-sky-600" />
                              )}
                            </div>
                            {organizer.bio && <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{organizer.bio}</p>}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {fundraisers.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="h-4 w-4 text-emerald-700" />
                    <h2 className="text-lg font-black">Campaigns</h2>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {fundraisers.map((fundraiser) => (
                      <Link
                        key={fundraiser.id}
                        href={`/fundraisers/${fundraiser.slug}`}
                        className="overflow-hidden rounded-xl border border-zinc-200 transition hover:border-emerald-200 hover:bg-emerald-50/20"
                      >
                        {(fundraiser.image_url || fundraiser.banner) && (
                          <img src={fundraiser.image_url || fundraiser.banner || ""} alt="" className="h-28 w-full object-cover" />
                        )}
                        <div className="p-4">
                          {fundraiser.category && (
                            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{fundraiser.category}</p>
                          )}
                          <h3 className="mt-1 line-clamp-2 text-sm font-black text-zinc-950">{fundraiser.title}</h3>
                          {fundraiser.status && fundraiser.status !== "published" && (
                            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                              fundraiser.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              {fundraiser.status === "rejected" ? "Rejected" : "Pending review"}
                            </span>
                          )}
                          <p className="mt-2 text-xs font-semibold text-zinc-500">
                            {money(fundraiserRaised(fundraiser))} raised{fundraiser.goal ? ` of ${money(fundraiser.goal)}` : ""}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:self-start">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-orange-700" />
                <h2 className="text-lg font-black">Impact</h2>
              </div>
              {donations.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {donations.map((donation) => (
                    <li key={donation.id} className="rounded-xl bg-zinc-50 p-3">
                      <p className="text-sm font-black text-zinc-950">{money(donation.amount)}</p>
                      <Link href={`/fundraisers/${donation.fundraiser.slug}`} className="mt-1 block text-xs font-bold text-orange-700 hover:underline">
                        {donation.fundraiser.title}
                      </Link>
                      <p className="mt-1 text-[11px] font-semibold text-zinc-400">{dateLabel(donation.created_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-zinc-500">No public donation activity yet.</p>
              )}
            </aside>
          </div>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-black">No public activity yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Organizations, campaigns, and public donation activity will appear here when available.</p>
          </section>
        )}
      </div>
    </main>
  );
}