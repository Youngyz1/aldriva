"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

// Rectangular cover-image display for business_branches.cover_image_url:
// the photo when present, falling back to LocalBrandedPlaceholder's
// "business" variant when there's no cover_image_url, or when it fails to
// load (stale/removed storage object) -- same fallback-on-error pattern as
// components/staff/StaffAvatar.tsx, but rounded-lg/rectangular instead of a
// circular avatar, since a branch cover image isn't a headshot.
export default function BranchCoverImage({
  coverImageUrl,
  label,
  className = "h-16 w-24",
}: {
  coverImageUrl: string | null;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (coverImageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverImageUrl}
        alt={label}
        className={cn("shrink-0 rounded-lg object-cover", className)}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-lg", className)}>
      <LocalBrandedPlaceholder variant="business" title={label} iconClassName="h-5 w-5" />
    </div>
  );
}
