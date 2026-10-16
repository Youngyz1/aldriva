"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { V2TemplateGalleryPreviewFrame } from "./V2TemplateGalleryPreviewFrame";
import {
  previewTemplateSwitch,
  switchWebsiteTemplate,
} from "@/lib/actions/website-template-switch";
import type {
  TemplateSwitchSummary,
  TemplateSwitchTarget,
} from "@/lib/website-template-switch";

interface TemplateSwitchDialogProps {
  websiteId: string;
  currentTemplateId: string;
  currentTemplateName: string;
  canEdit: boolean;
  targets: TemplateSwitchTarget[];
  previews: Record<string, ReactNode>;
  getExpectedVersion: () => Promise<number | null>;
  onSwitched: () => void;
}

export function TemplateSwitchDialog({
  websiteId,
  currentTemplateId,
  currentTemplateName,
  canEdit,
  targets,
  previews,
  getExpectedVersion,
  onSwitched,
}: TemplateSwitchDialogProps) {
  const publicT = useTranslations("PublicSite") as unknown as (key: string) => string;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<TemplateSwitchSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const activeId = selectedId ?? targets.find((target) => !target.isCurrent)?.id ?? null;

  useEffect(() => {
    if (!open || !activeId) return;
    let cancelled = false;
    setLoadingSummary(true);
    setSummaryError(null);
    setSummary(null);
    previewTemplateSwitch(websiteId, activeId)
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) {
          setSummaryError(publicT("templateSwitchFailed"));
          return;
        }
        setSummary(result.data.summary);
      })
      .catch(() => {
        if (!cancelled) setSummaryError(publicT("templateSwitchFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeId, websiteId, publicT]);

  const handleConfirm = async () => {
    if (!activeId || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const expectedVersion = await getExpectedVersion();
      if (expectedVersion === null) {
        setSwitchError(publicT("templateSwitchStale"));
        return;
      }
      const result = await switchWebsiteTemplate(websiteId, activeId, expectedVersion);
      if (!result.success) {
        setSwitchError(
          result.code === "STALE_DRAFT" ? publicT("templateSwitchStale") : publicT("templateSwitchFailed")
        );
        return;
      }
      onSwitched();
    } catch {
      setSwitchError(publicT("templateSwitchFailed"));
    } finally {
      setSwitching(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
        <span>{currentTemplateName}</span>
        <button
          type="button"
          disabled
          title={publicT("templateSwitchNoEdit")}
          className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold opacity-50 dark:border-zinc-700"
        >
          {publicT("changeTemplate")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
        <span>{targets.find((target) => target.id === currentTemplateId)?.name ?? currentTemplateId}</span>
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setSwitchError(null);
            setOpen(true);
          }}
          className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-700"
        >
          {publicT("changeTemplate")}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label={publicT("templateSwitchTitle")} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{publicT("templateSwitchTitle")}</h2>
              <button type="button" aria-label={publicT("templateSwitchCancel")} onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-xl text-zinc-500">×</button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{publicT("templateSwitchLiveNote")}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {targets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  aria-pressed={activeId === target.id}
                  disabled={target.isCurrent}
                  onClick={() => setSelectedId(target.id)}
                  className={`overflow-hidden rounded-xl border text-left transition ${activeId === target.id ? "border-orange-600 ring-1 ring-orange-600" : "border-zinc-200 hover:border-zinc-300"} ${target.isCurrent ? "opacity-70" : ""}`}
                >
                  <V2TemplateGalleryPreviewFrame>{previews[target.id]}</V2TemplateGalleryPreviewFrame>
                  <div className="space-y-1 p-3">
                    <p className="text-sm font-bold">
                      {target.id === "food-order" ? publicT("foodOrderTemplateName") : target.id === "store" ? publicT("storeTemplateName") : target.name}
                      {target.isCurrent ? ` · ${publicT("templateSwitchCurrent")}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{target.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              {loadingSummary ? <p className="text-xs text-zinc-500">{publicT("templateSwitchLoading")}</p> : null}
              {summaryError ? <p role="alert" className="text-xs font-semibold text-rose-700 dark:text-rose-300">{summaryError}</p> : null}
              {summary && !loadingSummary ? (
                <div className="space-y-2 text-xs">
                  {summary.carriesOver.length > 0 ? (
                    <p><span className="font-bold">{publicT("templateSwitchCarries")}: </span>{summary.carriesOver.join(", ")}</p>
                  ) : null}
                  {summary.hiddenSections.length > 0 ? (
                    <p><span className="font-bold">{publicT("templateSwitchHidden")}: </span>{summary.hiddenSections.join(", ")}</p>
                  ) : null}
                  {summary.needsContent.length > 0 ? (
                    <p><span className="font-bold">{publicT("templateSwitchNeedsContent")}: </span>{summary.needsContent.join(", ")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {switchError ? <p role="alert" className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-300">{switchError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold hover:bg-zinc-50 dark:border-zinc-700">
                {publicT("templateSwitchCancel")}
              </button>
              <button
                type="button"
                disabled={!activeId || targets.some((target) => target.id === activeId && target.isCurrent) || switching || loadingSummary}
                onClick={() => void handleConfirm()}
                className="flex-1 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-45"
              >
                {switching ? publicT("templateSwitching") : publicT("templateSwitchConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
