"use client";

import Link from "next/link";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type DonorProfile = {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
};

function initial(value: string) {
  return (value.trim() || "A").charAt(0).toUpperCase();
}

export default function DonorProfileDialog({
  donorName,
  fundraiserTitle,
  profile,
}: {
  donorName: string;
  fundraiserTitle: string;
  profile?: DonorProfile | null;
}) {
  const displayName = profile?.name || donorName;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-bold text-zinc-950 hover:underline"
        >
          {donorName}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl bg-white p-6">
        <DialogHeader className="items-center text-center">
          {profile?.photo ? (
            <img
              src={profile.photo}
              alt={displayName}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <LocalBrandedPlaceholder
              variant="avatar"
              title={displayName}
              initials={initial(displayName)}
              className="h-20 w-20 rounded-full from-zinc-200 to-zinc-200 text-2xl text-zinc-700"
            />
          )}
          <DialogTitle className="pt-3 text-2xl font-black text-zinc-950">
            {displayName}
          </DialogTitle>
          <DialogDescription className="text-base text-zinc-600">
            {profile?.bio || "This profile has not yet been set up."}
          </DialogDescription>
        </DialogHeader>

        <p className="text-center text-sm font-semibold text-zinc-700">
          {donorName} donated to this fundraiser
        </p>
        <p className="text-center text-xs text-zinc-500">{fundraiserTitle}</p>

        {profile && (
          <Link
            href={`/organizers/${profile.id}`}
            className="mx-auto inline-flex text-sm font-bold text-zinc-950 hover:underline"
          >
            View profile
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
