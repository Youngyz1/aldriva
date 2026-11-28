"use client";

import { useEffect, useState } from "react";
import { RentalReceipt } from "@/components/receipt/variants/RentalReceipt";

const RECEIPT_PAPER_WIDTH = "80mm";

export function RentalReceiptPanel({
  data,
  token,
  businessSlug,
}: {
  data: any;
  token: string;
  businessSlug?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
  };

  // Print iframe management
  useEffect(() => {
    if (!open) return;

    // Create hidden iframe pointing at the print route
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.src = `/rentals/print/${encodeURIComponent(token)}`;
    document.body.appendChild(iframe);

    const onLoad = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("Print failed:", e);
      }
      // Remove iframe after print
      document.body.removeChild(iframe);
    };

    iframe.addEventListener("load", onLoad);

    // Cleanup: remove iframe on unload / close
    return () => {
      document.body.removeChild(iframe);
      iframe.removeEventListener("load", onLoad);
    };
  }, [open]);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-black text-zinc-800 transition-colors hover:bg-zinc-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        Print receipt
      </button>

      {open && (
        <RentalReceipt
          data={data}
          animate={false}
          soundDefaultEnabled={false}
          downloadLabel="Print receipt"
        />
      )}
    </section>
  );
}