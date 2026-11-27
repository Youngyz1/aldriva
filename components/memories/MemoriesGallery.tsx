"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { IconX } from "@tabler/icons-react";
import type { MemoryGalleryItem, MemoryGalleryLabels, MemoryGalleryPage } from "@/lib/memories/gallery-types";
import {
  applyRefetchedPage,
  appendLoadedPage,
  flattenLoadedItems,
  toLoadedPage,
  type LoadedMemoryPage,
} from "@/lib/memories/gallery-pages";
import { SAMPLE_MEMORY_ITEMS } from "@/lib/memories/sample-memories";

export interface MemoriesGalleryProps {
  open: boolean;
  onClose: () => void;
  /** Cursor-based loader. Ignored when `sampleItems` is provided. */
  loadPage?: (cursor: string | null) => Promise<MemoryGalleryPage>;
  labels: MemoryGalleryLabels;
  /** Local sample photos for builder/demo preview (no network call). */
  sampleItems?: MemoryGalleryItem[];
  /** Unique id used for the trigger's aria-controls relationship. */
  dialogId?: string;
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getScrollLockTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const preview = document.querySelector<HTMLElement>('[data-testid="invitation-preview"]');
  return preview ?? document.body;
}

function aspectRatioOf(item: MemoryGalleryItem): number {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    return item.width / item.height;
  }
  return 4 / 3;
}

export function MemoriesGallery({
  open,
  onClose,
  loadPage,
  labels,
  sampleItems,
  dialogId,
  className,
}: MemoriesGalleryProps) {
  const autoId = useId().replace(/:/g, "");
  const layoutPrefix = `mem-${autoId}`;
  const panelId = dialogId ?? `${layoutPrefix}-dialog`;
  const titleId = `${layoutPrefix}-title`;
  const reduceMotion = useReducedMotion();

  const [pages, setPages] = useState<LoadedMemoryPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const initialFocusDone = useRef(false);
  const pagesRef = useRef<LoadedMemoryPage[]>([]);
  const refetchedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const isSampleMode = Array.isArray(sampleItems) && sampleItems.length > 0;
  const effectiveSample = useMemo(
    () => (isSampleMode ? (sampleItems as MemoryGalleryItem[]) : SAMPLE_MEMORY_ITEMS),
    [isSampleMode, sampleItems]
  );

  const items = useMemo(() => flattenLoadedItems(pages), [pages]);
  const nextCursor = pages.length > 0 ? pages[pages.length - 1].nextCursor : null;

  const reset = useCallback(() => {
    setPages([]);
    setLoading(false);
    setError(null);
    setSelectedId(null);
    refetchedIdsRef.current = new Set();
    initialFocusDone.current = false;
  }, []);

  // Load the first page (or sample items) when the dialog opens.
  useEffect(() => {
    if (!open) return;
    triggerRef.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    if (isSampleMode || !loadPage) {
      setPages([
        {
          cursor: null,
          items: effectiveSample,
          nextCursor: null,
        },
      ]);
      setLoading(false);
      setError(null);
      setSelectedId(null);
      return;
    }

    let cancelled = false;
    setPages([]);
    setError(null);
    setSelectedId(null);
    refetchedIdsRef.current = new Set();
    setLoading(true);
    loadPage(null)
      .then((page) => {
        if (cancelled) return;
        setPages([toLoadedPage(null, page)]);
      })
      .catch(() => {
        if (cancelled) return;
        setError(labels.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isSampleMode, loadPage, effectiveSample, labels.error]);

  const loadMore = useCallback(async () => {
    if (!loadPage || loading || !nextCursor || isSampleMode) return;
    setLoading(true);
    setError(null);
    try {
      const page = await loadPage(nextCursor);
      setPages((current) => appendLoadedPage(current, toLoadedPage(nextCursor, page)));
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }, [loadPage, loading, nextCursor, isSampleMode, labels.error]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  // Restore focus to the trigger and reset state after close.
  useEffect(() => {
    if (open) return;
    const trigger = triggerRef.current;
    reset();
    if (trigger && typeof trigger.focus === "function") {
      // Defer so the dialog is gone before focus moves.
      window.setTimeout(() => trigger.focus(), 0);
    }
  }, [open, reset]);

  // Scroll lock: restore the PREVIOUS overflow value (scoped to the preview
  // pane when the invitation renders inside the builder's phone frame).
  useEffect(() => {
    if (!open) return;
    const target = getScrollLockTarget();
    if (!target) return;
    const previousOverflow = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      target.style.overflow = previousOverflow;
    };
  }, [open]);

  // Focus + keyboard handling only while open.
  useEffect(() => {
    if (!open) return;
    if (!initialFocusDone.current) {
      initialFocusDone.current = true;
      window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (selectedId) {
          setSelectedId(null);
        } else {
          close();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
      );
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, selectedId, close]);

  const onBackdropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const handleImageError = useCallback(
    async (itemId: string, event: SyntheticEvent<HTMLImageElement>) => {
      if (isSampleMode || !loadPage) return;
      const currentPages = pagesRef.current;
      let pageIndex = -1;
      for (let i = 0; i < currentPages.length; i += 1) {
        if (currentPages[i].items.some((item) => item.id === itemId)) {
          pageIndex = i;
          break;
        }
      }
      if (pageIndex < 0) return;
      const cursor = currentPages[pageIndex].cursor;

      if (refetchedIdsRef.current.has(itemId)) {
        // Already refetched once: hide the item without breaking the grid.
        setPages((prev) =>
          prev.map((p) => ({ ...p, items: p.items.filter((it) => it.id !== itemId) }))
        );
        setSelectedId((current) => (current === itemId ? null : current));
        return;
      }

      refetchedIdsRef.current = new Set(refetchedIdsRef.current).add(itemId);
      try {
        const fresh = await loadPage(cursor);
        const result = applyRefetchedPage(currentPages, pageIndex, fresh, itemId);
        setPages(result.pages);
        if (result.hidden) {
          // Item gone from storage (e.g. retention-deleted): hide it.
          setSelectedId((current) => (current === itemId ? null : current));
          return;
        }
        const replacement = result.pages
          .flatMap((p) => p.items)
          .find((it) => it.id === itemId);
        if (replacement) {
          (event.currentTarget as HTMLImageElement).src = replacement.url;
        }
      } catch {
        // Refetch failed: keep the item for now; a subsequent image error will
        // hit the "already refetched" path and hide it.
      }
    },
    [isSampleMode, loadPage]
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );
  const selectedIndex = selectedItem ? items.findIndex((it) => it.id === selectedItem.id) : -1;

  const onLightboxDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) setSelectedId(null);
  };

  if (!open) return null;

  const motionTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  return (
    <div
      id={panelId}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`fixed inset-0 z-[100] flex items-stretch justify-center ${className ?? ""}`}
      onPointerDown={onBackdropPointerDown}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/75" aria-hidden="true" />
      <div className="relative z-10 flex h-full w-full max-w-5xl flex-col overflow-hidden bg-[#0b1220] text-[#f5f0e6] shadow-2xl sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <h2 id={titleId} className="text-sm font-semibold uppercase tracking-[0.18em]">
            {labels.title}
            {isSampleMode ? (
              <span className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white/70">
                {labels.sample}
              </span>
            ) : null}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label={labels.close}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <IconX size={20} stroke={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {items.length === 0 && !loading && !error ? (
            <p className="py-16 text-center text-sm text-white/60">{labels.empty}</p>
          ) : (
            <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
              {items.map((item) => {
                const ratio = aspectRatioOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl bg-white/5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label={labels.title}
                  >
                    <div style={{ aspectRatio: String(ratio) }} className="relative w-full">
                      {/* layoutId is reserved for the selected (expanded) image. */}
                      <motion.img
                        layoutId={selectedId === item.id ? `${layoutPrefix}-${item.id}` : undefined}
                        src={item.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={item.width ?? undefined}
                        height={item.height ?? undefined}
                        onError={(e) => void handleImageError(item.id, e)}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <p className="py-6 text-center text-xs uppercase tracking-[0.15em] text-white/50" aria-live="polite">
              …
            </p>
          ) : null}

          {error ? (
            <div className="py-6 text-center">
              <p className="text-sm text-red-200">{error}</p>
              {loadPage && !isSampleMode ? (
                <button
                  type="button"
                  onClick={() => void (pages.length === 0 ? loadPage(null).then((p) => setPages([toLoadedPage(null, p)])).catch(() => setError(labels.error)) : loadMore())}
                  className="mt-3 rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-white/10"
                >
                  {labels.retry}
                </button>
              ) : null}
            </div>
          ) : null}

          {nextCursor && !loading && !isSampleMode ? (
            <div className="flex justify-center py-6">
              <button
                type="button"
                onClick={() => void loadMore()}
                className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {labels.loadMore}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Expanded lightbox: shared-element motion only on the selected image. */}
      <AnimatePresence>
        {selectedItem ? (
          <motion.div
            key="memories-lightbox"
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label={labels.close}
              className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <IconX size={22} stroke={1.75} aria-hidden="true" />
            </button>
            <motion.div
              drag={reduceMotion ? false : "y"}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={onLightboxDragEnd}
              className="relative max-h-[90vh] max-w-[92vw]"
            >
              <motion.img
                layoutId={`${layoutPrefix}-${selectedItem.id}`}
                src={selectedItem.url}
                alt=""
                width={selectedItem.width ?? undefined}
                height={selectedItem.height ?? undefined}
                onError={(e) => void handleImageError(selectedItem.id, e)}
                transition={motionTransition}
                className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain"
                style={{ aspectRatio: String(aspectRatioOf(selectedItem)) }}
              />
            </motion.div>
            {selectedIndex > 0 ? (
              <button
                type="button"
                aria-label="Previous"
                onClick={() => setSelectedId(items[selectedIndex - 1]?.id ?? null)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
              >
                ‹
              </button>
            ) : null}
            {selectedIndex >= 0 && selectedIndex < items.length - 1 ? (
              <button
                type="button"
                aria-label="Next"
                onClick={() => setSelectedId(items[selectedIndex + 1]?.id ?? null)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
              >
                ›
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
