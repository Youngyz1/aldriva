"use client";

/**
 * components/rental/StaffRentalReceiptPanel.tsx
 *
 * Staff-facing receipt for the booking detail page. The trigger button
 * stays inline in the action row; the on-screen receipt itself renders as
 * a side panel — portaled into whichever rail `page.tsx` provides
 * (`#rental-receipt-rail-desktop` on lg+, `#rental-receipt-rail-mobile`
 * below lg), never as a fixed overlay, so it cannot cover or shift the
 * rest of the page.
 *
 * PRINTING IS UNCHANGED: a second, always-hidden-on-screen copy is still
 * portaled straight into <body> (`data-receipt-print-portal`), exactly as
 * before. @media print hides every other direct child of <body> and
 * resets this copy's ancestors to position:static/overflow:visible so it
 * reflows to a single 80mm page — see PRINT_STYLES, verbatim from the
 * previous version. Do not add any on-screen chrome to this hidden copy.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconPrinter as Printer, IconX as X } from "@tabler/icons-react";
import { RentalReceipt } from "@/components/receipt/variants/RentalReceipt";
import type { RentalReceiptData } from "@/lib/rental/receipt-data";

const RECEIPT_PAPER_WIDTH = "80mm";

/** Natural PrintedReceipt width (PrintedReceipt.tsx:394, max-w-[400px]). */
const RECEIPT_NATURAL_WIDTH = 400;
/** On-screen panel target width — "about 300px" per spec. */
const RECEIPT_DISPLAY_WIDTH = 300;
const RECEIPT_SCALE = RECEIPT_DISPLAY_WIDTH / RECEIPT_NATURAL_WIDTH;

const DESKTOP_RAIL_ID = "rental-receipt-rail-desktop";
const MOBILE_RAIL_ID = "rental-receipt-rail-mobile";

/**
 * Print rules, unchanged from the previous version. Kept as one block so a
 * future diff makes it obvious nothing here was touched:
 * - print-only root: every other direct child of <body> is display:none
 *   (no visibility tricks, no blank paginated space).
 * - every ancestor of the receipt inside the portal is reset to
 *   position:static / overflow:visible / height:auto / max-height:none /
 *   transform:none.
 * - printer head, paper-feed zigzag, action buttons and the (now removed)
 *   close bar stay hidden.
 * - the receipt column is locked to 80mm, centred, break-inside: avoid.
 */
const PRINT_STYLES = `
  @media print {
    body > *:not([data-receipt-print-portal]) { display: none !important; }

    [data-receipt-print-portal],
    [data-receipt-scroll] {
      position: static !important;
      inset: auto !important;
      top: auto !important;
      right: auto !important;
      bottom: auto !important;
      left: auto !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      transform: none !important;
      background: none !important;
      padding: 0 !important;
      margin: 0 !important;
      display: block !important;
    }

    [data-receipt-feed] {
      position: static !important;
      overflow: visible !important;
      height: auto !important;
      max-height: none !important;
      transform: none !important;
    }

    [data-receipt-slot],
    [data-receipt-zigzag],
    [data-receipt-actions],
    [data-receipt-close-bar] {
      display: none !important;
    }

    [data-receipt-shadow] {
      filter: none !important;
    }

    [data-receipt-print-root] {
      width: ${RECEIPT_PAPER_WIDTH} !important;
      max-width: ${RECEIPT_PAPER_WIDTH} !important;
      margin: 0 auto !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      min-height: 0 !important;
    }

    [data-receipt-paper] {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      min-height: 0 !important;
    }

    @page {
      size: ${RECEIPT_PAPER_WIDTH} auto;
      margin: 0;
    }
  }
`;

/**
 * On-screen panel body: a bordered card (matches FinancialsCard's style)
 * with its own Print/Close header, holding the receipt scaled down via
 * `transform: scale()` so it is fully visible on a normal laptop screen
 * without scrolling. The wrapper's height is measured from the receipt's
 * unscaled natural height and multiplied by the same scale factor, per
 * the "transform with matching height" option in the spec.
 */
function ReceiptPanelBody({
  data,
  onClose,
}: {
  data: RentalReceiptData;
  onClose: () => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => setScaledHeight(el.scrollHeight * RECEIPT_SCALE);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      data-receipt-onscreen-panel=""
      className="rounded-xl border border-zinc-200 bg-white p-3 space-y-3"
    >
      <style>{`[data-receipt-onscreen-panel] [data-receipt-actions] { display: none; }`}</style>

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Receipt</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="mx-auto overflow-hidden"
        style={{ width: RECEIPT_DISPLAY_WIDTH, height: scaledHeight ?? undefined }}
      >
        <div
          ref={measureRef}
          style={{ width: RECEIPT_NATURAL_WIDTH, transform: `scale(${RECEIPT_SCALE})`, transformOrigin: "top left" }}
        >
          <RentalReceipt
            data={data}
            animate={false}
            soundDefaultEnabled={false}
            downloadLabel="Print receipt"
          />
        </div>
      </div>
    </div>
  );
}

export function StaffRentalReceiptPanel({ data }: { data: RentalReceiptData }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const desktopRail = mounted ? document.getElementById(DESKTOP_RAIL_ID) : null;
  const mobileRail = mounted ? document.getElementById(MOBILE_RAIL_ID) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print receipt
      </button>

      {/* On-screen side panel: rendered into whichever rail page.tsx shows
          for the current breakpoint. Both portals are mounted at once;
          only one rail is ever visible at a time (desktop rail is
          `hidden lg:block`, mobile rail is `lg:hidden`), so exactly one
          copy is ever on screen. Neither is a fixed overlay — nothing here
          can cover or shift the rest of the page. */}
      {open && desktopRail
        ? createPortal(<ReceiptPanelBody data={data} onClose={() => setOpen(false)} />, desktopRail)
        : null}
      {open && mobileRail
        ? createPortal(<ReceiptPanelBody data={data} onClose={() => setOpen(false)} />, mobileRail)
        : null}

      {/* Print-only copy: always display:none on screen, shown only by
          PRINT_STYLES during @media print. Unchanged in shape from the
          previous version — no Close/Print chrome, since it is never
          visible to click. */}
      {mounted && open
        ? createPortal(
            <div data-receipt-print-portal="" style={{ display: "none" }}>
              <style>{PRINT_STYLES}</style>
              <div data-receipt-scroll="">
                <RentalReceipt
                  data={data}
                  animate={false}
                  soundDefaultEnabled={false}
                  downloadLabel="Print receipt"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
