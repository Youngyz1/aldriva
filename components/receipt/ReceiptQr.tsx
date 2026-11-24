"use client";

import { useEffect, useState } from "react";
import { ExpandableSvgQr } from "@/components/cards/ExpandableQr";

/**
 * Event QR slot for the printed receipt.
 *
 * Event tickets keep their existing QR behaviour and design: the same
 * `/verify/<code>` payload, the same `qrcode` SVG renderer, the same solid
 * white panel with dark modules, and the same tap-to-enlarge dialog used by
 * `CardQRCode`. The receipt never generates or mutates a code.
 */
export function ReceiptQr({
  value,
  hint,
}: {
  /** Raw ticket code, or an already-absolute verification URL. */
  value: string;
  hint?: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const isAbsolute = /^https?:\/\//i.test(value);
  const payload = isAbsolute ? value : origin ? `${origin}/verify/${value}` : `/verify/${value}`;

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
        <ExpandableSvgQr
          value={payload}
          triggerSize={180}
          dark="#09090b"
          light="#ffffff"
          openLabel="Tap to enlarge entry code"
          title="Entry code"
          hint={
            hint ??
            "Hold your code toward the scanner. Increase your screen brightness if needed."
          }
        />
      </div>
      <p className="mt-2 max-w-full break-all text-center font-mono text-[11px] tracking-[0.18em] text-zinc-500">
        {value}
      </p>
    </div>
  );
}
