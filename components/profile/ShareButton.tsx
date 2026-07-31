"use client";

import { useShare } from "@/hooks/use-share";

interface ShareButtonProps {
  url: string;
  className: (state: { copied: boolean }) => string;
  children: (state: { copied: boolean }) => React.ReactNode;
}

/** Copy-link button shared across every profile type — same render-prop shape as FollowButton. */
export default function ShareButton({ url, className, children }: ShareButtonProps) {
  const { copied, copyLink } = useShare(url);

  return (
    <button type="button" onClick={copyLink} className={className({ copied })}>
      {children({ copied })}
    </button>
  );
}
