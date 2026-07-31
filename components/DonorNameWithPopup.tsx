"use client";

import { useState } from "react";
import DonorPopup from "@/components/DonorPopup";

type Props = {
  name: string;
  fundraiserTitle: string;
};

export default function DonorNameWithPopup({ name, fundraiserTitle }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block max-w-full truncate text-left text-sm font-bold text-zinc-950 hover:underline"
      >
        {name}
      </button>
      {open && (
        <DonorPopup
          name={name}
          fundraiserTitle={fundraiserTitle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
