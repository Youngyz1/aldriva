"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

// Shared staff avatar: the photo when present, falling back to
// LocalBrandedPlaceholder's initials/icon when there's no photo_url, or when
// the photo_url fails to actually load (stale/removed storage object).
export default function StaffAvatar({
  photoUrl,
  name,
  className = "h-10 w-10",
}: {
  photoUrl: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", className)}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-full", className)}>
      <LocalBrandedPlaceholder variant="avatar" title={name} seed={name} />
    </div>
  );
}
