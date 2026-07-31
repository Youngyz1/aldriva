"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
};

const widthClass = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export default function AdminDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "lg",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative flex h-full w-full flex-col bg-white shadow-2xl",
          widthClass[width]
        )}
      >
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0 pr-4">
            <h2 className="truncate text-lg font-black text-zinc-950">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm font-medium text-zinc-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="border-t border-zinc-100 bg-zinc-50/80 px-5 py-4">{footer}</div>
        )}
      </aside>
    </div>
  );
}
