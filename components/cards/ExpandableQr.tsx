"use client";

/**
 * components/cards/ExpandableQr.tsx
 *
 * Tap-to-enlarge QR overlay for guest passes. Presentation layer only:
 * the QR payload is never minted, signed, or altered — the dialog renders
 * the exact same value as inline SVG at both sizes on a solid white panel
 * for reliable scanning. SVG (not canvas or a remote image) is deliberate:
 * it avoids canvas paint timing and image-host CSP failures, survives
 * dialog mount/unmount, and carries responsive intrinsic sizing. Focus trap, Escape,
 * backdrop-close, body scroll-lock, and focus restoration all come from
 * the shared Radix Dialog (components/ui/dialog). Honors reduced-motion
 * preferences.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const EXPANDABLE_QR_LARGE_SIZE = 512;
/** Quiet-zone margin in modules (never 0 — scanners need the blank border). */
export const EXPANDABLE_QR_MARGIN = 2;

interface DialogShellProps {
  openLabel: string;
  title: string;
  hint: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}

function ExpandableQrDialog({ openLabel, title, hint, trigger, children }: DialogShellProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={openLabel}
          title={openLabel}
          className="cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[36rem] bg-white text-center motion-reduce:animate-none">
        <DialogTitle className="text-sm font-black uppercase tracking-wider text-zinc-700">
          {title}
        </DialogTitle>
        <div className="mx-auto w-full max-w-[512px] rounded-xl bg-white p-4 shadow-xs" data-qr-panel>
          <DialogClose asChild>
            <button
              type="button"
              aria-label={`Close ${title}`}
              className="mx-auto block w-full cursor-zoom-out"
            >
              {children}
            </button>
          </DialogClose>
        </div>
        <DialogDescription className="text-xs font-medium text-zinc-500">
          {hint}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

interface QrSvgProps {
  /** Exact QR payload — reused unchanged in both sizes. */
  value: string;
  /** Accessible label for the enlarge trigger button. */
  openLabel: string;
  /** Dialog heading. */
  title: string;
  /** Brightness hint shown under the enlarged code. */
  hint: string;
  /** Small (trigger) pixel size. Defaults to 200. */
  triggerSize?: number;
  /** Enlarged pixel size. Defaults to 512. */
  largeSize?: number;
  dark?: string;
  light?: string;
  className?: string;
}

/**
 * QR rendered as inline SVG at both sizes via the existing `qrcode` lib.
 * The same payload is embedded directly in the portal, avoiding canvas
 * paint timing and third-party image hosts. Explicit responsive sizing on
 * the SVG keeps it visible inside the dialog's constrained width.
 */
export function ExpandableSvgQr({
  value,
  openLabel,
  title,
  hint,
  triggerSize = 200,
  largeSize = EXPANDABLE_QR_LARGE_SIZE,
  dark = "#09090b",
  light = "#ffffff",
  className = "",
}: QrSvgProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toString(value, {
          type: "svg",
          width: largeSize,
          margin: EXPANDABLE_QR_MARGIN,
          color: { dark, light },
        })
      )
      .then((markup) => {
        if (!cancelled && typeof markup === "string") {
          setSvg(markup.replace("<svg ", '<svg style="display:block;width:100%;height:auto" '));
        }
      })
      .catch(() => {
        /* render failure keeps the placeholder — never a broken image */
      });
    return () => {
      cancelled = true;
    };
  }, [value, largeSize, dark, light]);

  return (
    <ExpandableQrDialog
      openLabel={openLabel}
      title={title}
      hint={hint}
      trigger={
        <span
          className={`inline-block ${className}`}
          style={{ width: triggerSize, height: triggerSize }}
        >
          {svg ? (
            <span
              aria-hidden="true"
              className="block h-full w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="block bg-zinc-100"
              style={{ width: triggerSize, height: triggerSize }}
            />
          )}
        </span>
      }
    >
      {svg ? (
        <span
          className="mx-auto block w-full"
          style={{ maxWidth: largeSize }}
          role="img"
          aria-label={title}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="mx-auto block bg-zinc-100"
          style={{ width: 240, height: 240 }}
        />
      )}
    </ExpandableQrDialog>
  );
}

/**
 * Download the QR payload as a PNG file (rendered off-screen at click
 * time — replaces the old trigger-canvas readback).
 */
export async function downloadQrPng(value: string, filename: string): Promise<boolean> {
  try {
    const QRCode = await import("qrcode");
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, value, {
      width: 512,
      margin: EXPANDABLE_QR_MARGIN,
      color: { dark: "#09090b", light: "#ffffff" },
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    return true;
  } catch {
    return false;
  }
}
