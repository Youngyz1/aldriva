"use client";

import { useState } from "react";
import Link from "next/link";
import DonorPopup from "@/components/DonorPopup";

type Props = {
  name: string;
  fundraiserTitle: string;
  /**
   * Link to the beneficiary's public profile, set only once they have claimed
   * it. Without one there is no profile to navigate to, so the name opens the
   * "not set up yet" card instead of being a dead link.
   *
   * The href carries the referring campaign (`?from=`), because the public
   * profile shows only that one campaign and never a list.
   */
  profileHref?: string | null;
  className?: string;
};

/**
 * Beneficiary name on the campaign page.
 *
 * Mirrors DonorNameWithPopup, which is the pattern already used for donor names
 * in the donor list and comments — same popup component, so a name that has no
 * profile behind it behaves consistently wherever it appears.
 *
 * The name is always interactive. Previously an unclaimed beneficiary rendered
 * as dead plain text, which looked like a broken link.
 */
export default function BeneficiaryNameWithPopup({
  name,
  fundraiserTitle,
  profileHref,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const style =
    className ??
    "block max-w-full truncate text-left text-sm font-black text-zinc-950 transition hover:text-brand-700 hover:underline";

  if (profileHref) {
    return (
      <Link href={profileHref} className={style}>
        {name}
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={style}>
        {name}
      </button>
      {open && (
        <DonorPopup
          name={name}
          fundraiserTitle={fundraiserTitle}
          onClose={() => setOpen(false)}
          relationLabel={`${name} is the beneficiary of this fundraiser`}
          dialogLabel={`Beneficiary profile for ${name}`}
        />
      )}
    </>
  );
}
