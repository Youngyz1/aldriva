"use client";

import { useState } from "react";
import Link from "next/link";
import ProfileNotSetUpModal, {
  type ProfileActivity,
} from "@/components/ProfileNotSetUpModal";

type DonorProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
} | null;

type Donation = {
  id: string;
  donor_name: string | null;
  amount: number | string | null;
  created_at: string;
  user_id: string | null;
  profile: DonorProfile;
};

function money(value: string | number) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function timeAgo(value: string) {
  const days = Math.floor(
    (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 1) {
    return new Date(value).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function initial(value: string) {
  return (value.trim() || "A").charAt(0).toUpperCase();
}

type ModalState = {
  name: string;
  activity: ProfileActivity;
} | null;

export default function DonorList({
  fundraiserId,
  initialDonations,
  initialHasMore,
}: {
  fundraiserId: string;
  initialDonations: Donation[];
  initialHasMore: boolean;
}) {
  const [donations, setDonations] = useState(initialDonations);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  async function loadMore() {
    setLoading(true);
    const res = await fetch(
      `/api/fundraisers/${fundraiserId}/donors?offset=${donations.length}`
    );
    const data = await res.json();
    if (data.ok) {
      setDonations((current) => {
        const existingIds = new Set(current.map((d) => d.id));
        const newDonations = (data.donations as Donation[]).filter(
          (d) => !existingIds.has(d.id)
        );
        return [...current, ...newDonations];
      });
      setHasMore(data.hasMore);
    }
    setLoading(false);
  }

  if (donations.length === 0) {
    return <p className="mt-4 text-sm text-zinc-500">No donations yet.</p>;
  }

  return (
    <>
      <ul className="mt-3 space-y-3 lg:mt-4 lg:space-y-4">
        {donations.map((donation) => {
          const displayName = donation.donor_name || "Anonymous";
          const amount = Number(donation.amount ?? 0);
          // Navigate to profile only if they have a customized profile
          // (display_name or avatar_url set), regardless of whether they
          // have a user_id. Anyone without a customised profile gets the modal.
          const hasCustomizedProfile = Boolean(
            donation.profile &&
              (donation.profile.display_name || donation.profile.avatar_url)
          );
          const profileName =
            donation.profile?.display_name || displayName;

          return (
            <li key={donation.id} className="flex items-center gap-2 lg:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-black text-zinc-600 lg:h-10 lg:w-10">
                {initial(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                {hasCustomizedProfile ? (
                  <Link
                    href={`/profile/${donation.profile!.id}`}
                    className="truncate text-sm font-bold text-zinc-950 hover:underline"
                  >
                    {profileName}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        name: displayName,
                        activity: { type: "donation", amount },
                      })
                    }
                    className="truncate text-left text-sm font-bold text-zinc-950 hover:underline"
                  >
                    {displayName}
                  </button>
                )}
                <p className="text-xs text-zinc-500">
                  {money(amount)} · {timeAgo(donation.created_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-3 w-full rounded-full border border-zinc-300 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 lg:mt-4"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}

      <ProfileNotSetUpModal
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        name={modal?.name ?? ""}
        activity={modal?.activity ?? { type: "donation", amount: 0 }}
      />
    </>
  );
}