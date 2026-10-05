/**
 * app/admin/workforce/office/PanelCloseButton.tsx — Stage 21 (P3).
 *
 * Props-only client leaf: clears the ?agent= selection. The Link clears it
 * without JavaScript (plain navigation); Esc does the same via
 * router.replace (no scroll jump). No fetch, no actions, no data imports.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";

const OFFICE_PATH = "/admin/workforce/office";

export function PanelCloseButton() {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.replace(OFFICE_PATH, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <Link
      href={OFFICE_PATH}
      aria-label="Clear agent selection"
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-950"
    >
      <X size={15} aria-hidden="true" />
    </Link>
  );
}
