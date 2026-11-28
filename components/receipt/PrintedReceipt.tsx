"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { BRAND } from "@/config/branding";
import { ReceiptBarcode } from "./ReceiptBarcode";
import { ReceiptQr } from "./ReceiptQr";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useReceiptSound } from "./useReceiptSound";

export type ReceiptDetail = {
  label: string;
  value: string;
  /** Heavier value weight for the row the user came to read (seat, tier…). */
  emphasis?: boolean;
  /** Monospace value. Reserved for amounts and references. */
  mono?: boolean;
};

/** Backwards-compatible alias for the details grid. */
export type ReceiptRow = ReceiptDetail;

export type ReceiptItem = {
  name: string;
  quantity?: number | null;
  /** Pre-formatted line amount, e.g. "USD 12.50". Rendered monospace. */
  amount?: string | null;
};

export type ReceiptStatusTone = "success" | "warning" | "danger" | "neutral";

export type ReceiptStatus = {
  label: string;
  /** Kept for callers; the paper is monochrome, so no tone is rendered. */
  tone?: ReceiptStatusTone;
};

export type ReceiptCode =
  | { kind: "qr"; value: string; hint?: string }
  /**
   * `value` must be a signed scan code from the scanner phase. Order numbers,
   * tracking tokens and lookup tokens are guessable and are never encoded.
   */
  | { kind: "barcode"; value?: string | null; caption?: string }
  | { kind: "none"; note?: string | null; reference?: string | null };

export type PrintedReceiptProps = {
  /** Short family label, e.g. "Event ticket" or "Business order". */
  typeLabel: string;
  /** Large primary line: event, business, campaign or hotel name. */
  name: string;
  subtitle?: string | null;
  /** Logo image URL. Rendered grayscale; falls back to the name's initial. */
  logoSrc?: string | null;
  /** Optional cover image, printed as a short grayscale banner. */
  coverSrc?: string | null;
  /** Order line items (orders, merchandise). Printed before the details grid. */
  items?: ReceiptItem[];
  /** Details grid rows. */
  rows?: ReceiptDetail[];
  total?: { label: string; value: string } | null;
  status?: ReceiptStatus | null;
  code?: ReceiptCode;
  note?: string | null;
  /** Reference printed under the code area. Shortened, never a full UUID. */
  reference?: string | null;
  /**
   * Play the printer animation once. Callers pass `true` only on the first
   * render right after payment/confirmation, never when reopening a receipt.
   */
  animate?: boolean;
  /**
   * Default the printer sound to on for a tap-initiated open. Existing
   * call sites keep the historical off-by-default behaviour.
   */
  soundDefaultEnabled?: boolean;
  downloadLabel?: string;
  /** Download handler. Falls back to the browser print dialog (save as PDF). */
  onDownload?: () => void;
  /** Override the whole code area, e.g. to embed an existing pass layout. */
  codeSlot?: ReactNode;
  className?: string;
};

/**
 * Fixed paper palette. The sheet is always white with #111 ink, in both
 * themes, so nothing in here reads a theme token or a `dark:` variant.
 * Fully monochrome: no accent colour reaches the paper.
 */
const PAPER = {
  bg: "#FFFFFF",
  ink: "#111111",
  muted: "#5F5E5A",
  line: "#C9C7BF",
};

/** Stepped feed: 16 moves, 230–340 ms apart, each ~220 ms of ease-out. */
const FEED_STEPS = 16;
const FEED_MOVE_MS = 220;
const FEED_PAUSE_MIN = 230;
const FEED_PAUSE_MAX = 340;

const ZIGZAG_HEIGHT = 8;
/** Teeth along the 400px paper's bottom edge. */
const ZIGZAG_PATH = (() => {
  const width = 400;
  const step = width / 20;
  let path = `M0 0 H${width}`;
  for (let x = width; x > 0; x -= step) {
    path += ` L${x - step / 2} ${ZIGZAG_HEIGHT} L${x - step} 0`;
  }
  return `${path} Z`;
})();

function pause(): number {
  return FEED_PAUSE_MIN + Math.random() * (FEED_PAUSE_MAX - FEED_PAUSE_MIN);
}

/** Last 8 characters, uppercase — never a full UUID on the paper. */
export function shortReference(value?: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[^a-zA-Z0-9]/g, "");
  if (!compact) return null;
  return compact.slice(-8).toUpperCase();
}

/** Thin wrapper over the canonical formatter in lib/money.ts. */
export function formatReceiptAmount(
  amount: number,
  currency?: string | null,
  locale?: string
): string {
  return formatMoney(amount, currency, locale);
}

function DashedRule() {
  return <div className="my-4 border-t border-dashed" style={{ borderColor: PAPER.line }} />;
}

/**
 * Tear line: dashed rule with a half-circle notch bitten out of each edge.
 * The notches sit half outside the paper and are clipped by the wrapper, so
 * each one reads as a semicircular cut.
 */
function Perforation() {
  return (
    <div className="relative my-5" aria-hidden="true">
      <div className="border-t border-dashed" style={{ borderColor: PAPER.line }} />
      <span
        className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: PAPER.bg, border: `1px solid ${PAPER.line}` }}
      />
      <span
        className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: PAPER.bg, border: `1px solid ${PAPER.line}` }}
      />
    </div>
  );
}

function Logo({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim().charAt(0) || "A").toUpperCase();

  if (src && !failed) {
    return (
      <span className="flex h-10 items-center justify-center">
        {/* Arbitrary owner-supplied URL: a plain img avoids remote-pattern config. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="max-h-10 w-auto max-w-[220px] object-contain"
          style={{ filter: "grayscale(1) contrast(1.1)" }}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
      style={{ backgroundColor: PAPER.ink, color: PAPER.bg }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

function CoverBanner({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className="mt-3 overflow-hidden" style={{ height: 72 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
        style={{ filter: "grayscale(1) contrast(1.1)" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * PrintedReceipt
 *
 * One receipt surface for tickets, orders, donations and bookings. A dark
 * printer slot sits on top; the white 400px paper feeds out of it in stepped
 * bursts, clipped by the slot like a thermal printer, and ends in a torn
 * zigzag edge. All content comes from props — this component never computes
 * amounts, mints codes or reads a data source.
 */
export function PrintedReceipt({
  typeLabel,
  name,
  subtitle,
  logoSrc,
  coverSrc,
  items = [],
  rows = [],
  total,
  status,
  code = { kind: "none" },
  note,
  reference,
  animate = false,
  soundDefaultEnabled = false,
  downloadLabel = "Download",
  onDownload,
  codeSlot,
  className,
}: PrintedReceiptProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const {
    enabled: soundEnabled,
    toggle: toggleSound,
    start: startSound,
    stop: stopSound,
  } = useReceiptSound({ defaultEnabled: soundDefaultEnabled });

  const paperRef = useRef<HTMLElement>(null);
  const paperHeightRef = useRef(0);
  const startedRef = useRef(false);
  const soundStartedRef = useRef(false);

  // `null` = fully revealed. A number is the visible height in px while the
  // sheet is still feeding. Seeded from the prop so an animating receipt is
  // never painted open for a frame before the first step.
  const [revealed, setRevealed] = useState<number | null>(animate ? 0 : null);
  const [printing, setPrinting] = useState(false);
  const [demoBarcode, setDemoBarcode] = useState(false);

  // Reduced motion: show the finished sheet immediately, no sound.
  useEffect(() => {
    if (!prefersReducedMotion) return;
    setPrinting(false);
    setRevealed(null);
  }, [prefersReducedMotion]);

  // Printing is a synchronous snapshot. If the sheet is mid-feed, reveal the
  // whole article before the print dialog captures the page.
  useEffect(() => {
    const onBeforePrint = () => {
      setPrinting(false);
      setRevealed(null);
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, []);

  // Development-only placeholder barcode so the layout can be checked before
  // the scanner phase issues real signed scan codes.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    try {
      const params = new URLSearchParams(window.location.search);
      setDemoBarcode(params.get("demoBarcode") === "1");
    } catch {
      // No URL access — leave the barcode hidden.
    }
  }, []);

  // Start the feed once per mount, measured from the paper's real height.
  useEffect(() => {
    if (prefersReducedMotion || !animate || startedRef.current) return;
    const paper = paperRef.current;
    if (!paper) return;

    startedRef.current = true;
    paperHeightRef.current = paper.offsetHeight;
    setPrinting(true);
    setRevealed(0);
  }, [animate, prefersReducedMotion]);

  // Stepped feed.
  useEffect(() => {
    if (!printing) return;

    const totalHeight = paperHeightRef.current || paperRef.current?.offsetHeight || 0;
    let step = 0;
    let timer = 0;
    let cancelled = false;

    const advance = () => {
      if (cancelled) return;
      step += 1;
      setRevealed(Math.round((totalHeight * step) / FEED_STEPS));

      if (step >= FEED_STEPS) {
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setPrinting(false);
          setRevealed(null);
        }, FEED_MOVE_MS);
        return;
      }

      timer = window.setTimeout(advance, pause());
    };

    timer = window.setTimeout(advance, pause());

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [printing]);

  // Sound runs alongside the feed, once, only when the user enabled it.
  useEffect(() => {
    if (!printing) {
      if (soundStartedRef.current) {
        soundStartedRef.current = false;
        stopSound();
      }
      return;
    }

    // Preference is read from localStorage after mount; if it resolves while
    // the paper is still feeding, the sound starts there instead.
    if (!soundEnabled || soundStartedRef.current) return;
    soundStartedRef.current = true;
    startSound();
  }, [printing, soundEnabled, startSound, stopSound]);

  const renderedCode = (() => {
    if (codeSlot) return codeSlot;

    if (code.kind === "qr") {
      return <ReceiptQr value={code.value} hint={code.hint} />;
    }

    if (code.kind === "barcode") {
      const value = (code.value ?? "").trim();
      if (value) {
        return <ReceiptBarcode value={value} caption={code.caption} />;
      }
      if (demoBarcode) {
        return <ReceiptBarcode value="DEMO0000000000" caption={code.caption} demo />;
      }
      // No signed scan code yet: the barcode is hidden and only the short
      // reference is printed, so nothing guessable is ever encoded.
      return reference ? <ReferenceBlock value={reference} /> : null;
    }

    if (code.reference || code.note) {
      return (
        <div className="space-y-3">
          {code.note ? (
            <p className="text-center text-xs leading-relaxed" style={{ color: PAPER.muted }}>
              {code.note}
            </p>
          ) : null}
          {code.reference ? <ReferenceBlock value={code.reference} /> : null}
        </div>
      );
    }

    return null;
  })();

  return (
    <div
      className={cn("mx-auto w-full max-w-[400px]", className)}
      data-receipt-print-root=""
    >
      {/* Printer slot. Stays dark in both themes and matches the paper width. */}
      <div
        className="relative z-20 rounded-t-xl bg-zinc-950 px-4 pb-3 pt-3 ring-1 ring-zinc-800/80 animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none"
        data-receipt-slot=""
      >
        <div className="mx-auto h-2 w-24 rounded-full bg-zinc-800 shadow-[inset_0_1px_3px_rgba(0,0,0,0.9)]" />
        <div
          className="mx-auto mt-2 h-px w-40"
          style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
        />
      </div>

      {/* Shape-following shadow: follows the notches and the torn edge. */}
      <div
        style={{ filter: "drop-shadow(0 14px 20px rgba(0,0,0,0.22))" }}
        data-receipt-shadow=""
      >
      {/* Paper. Clipped by the slot edge so it reads as feeding out of it. */}
      <div
        className="relative z-10 -mt-1 overflow-hidden"
        data-receipt-feed=""
        style={{
          height: revealed === null ? undefined : Math.max(0, revealed),
          transition:
            revealed === null || prefersReducedMotion
              ? undefined
              : `height ${FEED_MOVE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
      >
        <article
          ref={paperRef}
          aria-busy={printing}
          data-receipt-paper=""
          style={{
            backgroundColor: PAPER.bg,
            color: PAPER.ink,
          }}
        >
          <div className="px-5 pb-4 pt-5">
            <Logo src={logoSrc} name={name} />
            {coverSrc ? <CoverBanner src={coverSrc} /> : null}

            {/* Type chip + status tag. */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ borderColor: PAPER.ink, color: PAPER.ink }}
              >
                {typeLabel}
              </span>
              {status ? (
                <span
                  className="inline-flex items-center px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ backgroundColor: "#E7E5DE", color: PAPER.ink }}
                >
                  {status.label}
                </span>
              ) : null}
            </div>

            <h2 className="mt-3 text-[24px] font-bold leading-[1.2] tracking-tight">{name}</h2>
            {subtitle ? (
              <p className="mt-1 text-[13px] leading-relaxed" style={{ color: PAPER.muted }}>
                {subtitle}
              </p>
            ) : null}

            {items.length > 0 ? (
              <>
                <DashedRule />
                <ul className="space-y-2">
                  {items.map((item, index) => (
                    <li
                      key={`${item.name}-${index}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="min-w-0 break-words text-[13px] leading-snug">
                        {item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}
                        {item.name}
                      </span>
                      {item.amount ? (
                        <span className="shrink-0 font-mono text-[13px]">{item.amount}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {rows.length > 0 ? (
              <>
                {items.length === 0 ? <DashedRule /> : <div className="mt-4" />}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {rows.map((row, index) => (
                    <div key={`${row.label}-${index}`} className="min-w-0">
                      <dt
                        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={{ color: PAPER.muted }}
                      >
                        {row.label}
                      </dt>
                      <dd
                        className={cn(
                          "mt-1 break-words text-[14px] leading-snug",
                          row.mono && "font-mono",
                          row.emphasis ? "font-semibold" : "font-normal",
                        )}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            {total ? (
              <div
                className="mt-4 flex items-baseline justify-between gap-4 border-t pt-3"
                style={{ borderColor: PAPER.ink }}
              >
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: PAPER.muted }}
                >
                  {total.label}
                </span>
                <span className="font-mono text-[18px] font-bold tracking-tight">
                  {total.value}
                </span>
              </div>
            ) : null}

            <Perforation />

            {renderedCode ? <div className="pb-1">{renderedCode}</div> : null}

            {note ? (
              <p
                className="mt-4 border-l-2 pl-3 text-[11px] leading-relaxed"
                style={{ borderColor: PAPER.line, color: PAPER.muted }}
              >
                {note}
              </p>
            ) : null}

            <p
              className="mt-5 text-center text-[9px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: PAPER.muted }}
            >
              Powered by {BRAND.name}
            </p>
          </div>
        </article>
      </div>

      {/* Torn bottom edge: paper-coloured teeth, transparent between them. */}
      <svg
        className="block w-full"
        height={ZIGZAG_HEIGHT}
        viewBox={`0 0 400 ${ZIGZAG_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        data-receipt-zigzag=""
      >
        <path d={ZIGZAG_PATH} fill={PAPER.bg} />
      </svg>
      </div>

      {/* Action row sits outside the paper so it is never clipped. */}
      <div className="mt-4 flex items-center gap-2" data-receipt-actions="">
        <button
          type="button"
          onClick={onDownload ?? (() => window.print())}
          disabled={printing}
          aria-disabled={printing}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {printing ? "Printing…" : downloadLabel}
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? "Mute printer sound" : "Play printer sound"}
          title={soundEnabled ? "Mute printer sound" : "Play printer sound"}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          {soundEnabled ? (
            <IconVolume className="h-4 w-4" aria-hidden="true" />
          ) : (
            <IconVolumeOff className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function ReferenceBlock({ value }: { value: string }) {
  return (
    <div className="text-center">
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: PAPER.muted }}
      >
        Reference
      </p>
      <p className="mt-1 font-mono text-[12px] tracking-[0.08em] break-all px-2">{value}</p>
    </div>
  );
}
