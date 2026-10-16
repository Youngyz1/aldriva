"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContentDoc } from "@/lib/website-content";
import { isSameOriginWebsitePreviewMessage, isWebsitePreviewMessage, WEBSITE_PREVIEW_MESSAGE_SOURCE } from "@/lib/website-preview-channel";
import type { V2BuilderState, V2MenuItemChoice } from "@/lib/actions/website-v2";
import { WebsiteDevicePreviewFrame } from "./WebsiteDevicePreviewFrame";

interface WebsitePreviewPanelProps {
  websiteId: string;
  tenantId: string;
  siteTitle: string;
  initialState: V2BuilderState;
  content: ContentDoc;
  selectedPageSlug: string;
  onSelectPage: (slug: string) => void;
  menuItems?: V2MenuItemChoice[];
  onOpenMenuEditor?: () => void;
  offerings?: string[];
  isOrderingLive?: boolean;
}

export function WebsitePreviewPanel({
  websiteId,
  tenantId,
  siteTitle,
  initialState,
  content,
  selectedPageSlug,
  onSelectPage,
  menuItems,
  onOpenMenuEditor,
  offerings,
  isOrderingLive,
}: WebsitePreviewPanelProps) {
  const storeT = useTranslations("Storefront");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"mobile" | "desktop">("desktop");
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const frameSrc = `/website-preview/${encodeURIComponent(tenantId)}?websiteId=${encodeURIComponent(websiteId)}`;

  const sendDraft = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
      kind: "draft",
      websiteId,
      content,
      pageSlug: selectedPageSlug,
    }, window.location.origin);
  }, [content, selectedPageSlug, websiteId]);

  useEffect(() => {
    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setContainerSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const sendHello = () => iframeRef.current?.contentWindow?.postMessage({
      source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
      kind: "hello",
      websiteId,
    }, window.location.origin);
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isSameOriginWebsitePreviewMessage(event.origin, window.location.origin)) return;
      if (!isWebsitePreviewMessage(event.data)) return;
      if (event.data.kind === "ready") {
        window.clearInterval(helloTimer);
        setReady(true);
        sendDraft();
      } else if (event.data.kind === "open_menu_editor") {
        onOpenMenuEditor?.();
      }
    };
    const helloTimer = window.setInterval(sendHello, 300);
    sendHello();
    window.addEventListener("message", handleMessage);
    return () => {
      window.clearInterval(helloTimer);
      window.removeEventListener("message", handleMessage);
    };
  }, [onOpenMenuEditor, sendDraft, websiteId]);

  useEffect(() => {
    if (!ready || !menuItems) return;
    iframeRef.current?.contentWindow?.postMessage({
      source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
      kind: "update_menu_items",
      websiteId,
      menuItems,
    }, window.location.origin);
  }, [menuItems, ready, websiteId]);

  useEffect(() => {
    if (!ready || !offerings) return;
    iframeRef.current?.contentWindow?.postMessage({
      source: WEBSITE_PREVIEW_MESSAGE_SOURCE,
      kind: "update_offerings",
      websiteId,
      offerings,
    }, window.location.origin);
  }, [offerings, ready, websiteId]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(sendDraft, 140);
    return () => window.clearTimeout(timer);
  }, [content, ready, selectedPageSlug, sendDraft]);

  const pages = initialState.previewPages;

  return (
    <section className="flex h-full min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950" aria-label="Live website preview">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {pages.map((page) => <button key={page.slug} type="button" aria-pressed={selectedPageSlug === page.slug} onClick={() => onSelectPage(page.slug)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${selectedPageSlug === page.slug ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>{page.title}</button>)}
        </div>
        <div className="flex shrink-0 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="group" aria-label="Preview size">
          {(["desktop", "mobile"] as const).map((nextMode) => <button key={nextMode} type="button" aria-pressed={mode === nextMode} onClick={() => setMode(nextMode)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${mode === nextMode ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white" : "text-zinc-500 dark:text-zinc-400"}`}>{nextMode}</button>)}
        </div>
      </div>
      {isOrderingLive ? (
        <div
          role="note"
          data-testid="preview-ordering-notice"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {storeT("previewOrderingNotice")}
        </div>
      ) : null}
      <div ref={containerRef} className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-2 py-4 sm:items-center">
        <WebsiteDevicePreviewFrame
          mode={mode}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          iframeRef={iframeRef}
          iframeSrc={frameSrc}
          siteTitle={siteTitle}
        />
      </div>
      <div className="sr-only" aria-live="polite">{ready ? "Preview ready" : "Loading preview"}</div>
    </section>
  );
}
