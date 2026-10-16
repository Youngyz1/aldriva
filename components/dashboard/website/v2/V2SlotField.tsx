"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BLOCK_LIMITS } from "@/lib/website-blocks";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import type { V2MenuItemChoice } from "@/lib/actions/website-v2";
import type { WebsiteEditorControl } from "@/lib/website-v2-editor-schema";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import { UtensilsCrossed } from "lucide-react";

interface V2SlotFieldProps {
  control: WebsiteEditorControl;
  value: unknown;
  onChange: (value: unknown) => void;
  tenantId: string;
  template: WebsiteTemplateV2;
  menuItems: V2MenuItemChoice[];
  sampled: boolean;
  onOpenMenuEditor?: () => void;
  canManageMenu?: boolean;
}

const inputClass = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const DAYS = [
  ["mon", "monday"], ["tue", "tuesday"], ["wed", "wednesday"],
  ["thu", "thursday"], ["fri", "friday"], ["sat", "saturday"], ["sun", "sunday"],
] as const;
const SOCIALS = [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["x", "X"]] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function Counter({ current, max }: { current: number; max: number }) {
  return <div className="mt-1 text-right text-[11px] text-zinc-500">{current}/{max}</div>;
}

export function V2SlotField({
  control,
  value,
  onChange,
  tenantId,
  template,
  menuItems,
  sampled,
  onOpenMenuEditor,
  canManageMenu,
}: V2SlotFieldProps) {
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const tStorefront = useTranslations("Storefront");
  const showSample = sampled && (value === undefined || value === null || value === "");
  const maxText = control.field === "primary_cta_label"
    ? BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH
    : control.field === "hero_headline"
      ? BLOCK_LIMITS.HEADING_MAX_LENGTH
      : control.field === "hero_subtext"
        ? BLOCK_LIMITS.SUBHEADING_MAX_LENGTH
        : control.field === "email"
          ? BLOCK_LIMITS.EMAIL_MAX_LENGTH
          : control.field === "phone"
            ? BLOCK_LIMITS.PHONE_MAX_LENGTH
            : control.field === "address"
              ? BLOCK_LIMITS.ADDRESS_MAX_LENGTH
              : control.kind === "textarea"
                ? BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH
                : control.kind === "text" || control.kind === "nav-labels"
                  ? BLOCK_LIMITS.LABEL_MAX_LENGTH
                  : undefined;

  const label = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {control.label}{control.required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {sampled ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Sample</span> : null}
    </div>
  );

  const scalarText = typeof value === "string" ? value : "";
  const urlField = control.kind === "url";
  const updateItemField = (index: number, key: string, nextValue: unknown, aliases: string[] = []) => {
    const items = Array.isArray(value) ? value : [];
    onChange(items.map((entry, itemIndex) => {
      if (itemIndex !== index) return entry;
      const updated = { ...record(entry), [key]: nextValue };
      aliases.forEach((alias) => delete updated[alias]);
      return updated;
    }));
  };

  return (
    <fieldset className="space-y-2 border-b border-zinc-100 pb-4 last:border-0 dark:border-zinc-800">
      {label}
      {showSample ? <p className="-mt-1 text-xs text-amber-700 dark:text-amber-300">Sample: type to replace.</p> : null}

      {(control.kind === "text" || control.kind === "url") && control.field !== "nav_labels" ? (
        <>
          <input
            className={inputClass}
            type={urlField ? "url" : "text"}
            value={urlField && urlDraft !== null ? urlDraft : scalarText}
            maxLength={urlField ? BLOCK_LIMITS.URL_MAX_LENGTH : maxText}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (urlField) setUrlDraft(next);
              else onChange(next);
            }}
            onBlur={() => {
              if (!urlField || urlDraft === null) return;
              const clean = urlDraft.trim() ? sanitizeUrl(urlDraft) : "";
              onChange(clean);
              setUrlDraft(null);
            }}
            aria-label={control.label}
          />
          {maxText ? <Counter current={scalarText.length} max={maxText} /> : null}
          {urlField ? <><Counter current={(urlDraft ?? scalarText).length} max={BLOCK_LIMITS.URL_MAX_LENGTH} /><p className="text-[11px] text-zinc-500">Links are cleaned before they are saved.</p></> : null}
        </>
      ) : null}

      {control.kind === "textarea" ? (
        <>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={scalarText}
            maxLength={maxText ?? BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH}
            onChange={(event) => onChange(event.currentTarget.value)}
            aria-label={control.label}
          />
          <Counter current={scalarText.length} max={maxText ?? BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH} />
        </>
      ) : null}

      {control.kind === "image" ? (
        <MediaUploadField
          label={control.label}
          value={scalarText}
          tenantId={tenantId}
          folderSubpath="website"
          onChange={(url) => onChange(url)}
          requiredForPublish={control.required}
          hideLabel
        />
      ) : null}

      {control.kind === "images" ? (
        <div className="space-y-4">
          {(Array.isArray(value) ? value : []).map((image, index) => (
            <div key={`image-${index}`} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">Photo {index + 1}<button type="button" className="text-rose-600" onClick={() => onChange((value as unknown[]).filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>
              <MediaUploadField label={`Photo ${index + 1}`} value={typeof image === "string" ? image : ""} tenantId={tenantId} folderSubpath="website" onChange={(url) => onChange((Array.isArray(value) ? value : []).map((entry, itemIndex) => itemIndex === index ? url : entry))} />
            </div>
          ))}
          <p className="text-right text-[11px] text-zinc-500">{Array.isArray(value) ? value.length : 0}/{control.max ?? 6}</p>
          {(Array.isArray(value) ? value.length : 0) < (control.max ?? 6) ? <button type="button" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" onClick={() => onChange([...(Array.isArray(value) ? value : []), ""])}>Add photo</button> : null}
        </div>
      ) : null}

      {control.kind === "items" ? (
        <div className="space-y-3">
          {(Array.isArray(value) ? value : []).map((item, index) => {
            const row = record(item);
            return (
              <div key={`item-${index}`} className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-300"><span>Item {index + 1}</span><button type="button" className="text-rose-600" onClick={() => onChange((value as unknown[]).filter((_, itemIndex) => itemIndex !== index))}>Clear item</button></div>
                {(control.itemFields ?? []).map((itemField) => {
                  const rawItemValue = [itemField.key, ...(itemField.aliases ?? [])]
                    .map((key) => row[key])
                    .find((candidate) => typeof candidate === "string" && candidate.length > 0);
                  const itemValue = typeof rawItemValue === "string" ? rawItemValue : "";
                  const max = itemField.kind === "textarea"
                    ? BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH
                    : itemField.key === "question"
                      ? BLOCK_LIMITS.HEADING_MAX_LENGTH
                      : BLOCK_LIMITS.LABEL_MAX_LENGTH;
                  return <label key={itemField.key} className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">{itemField.label}{itemField.kind === "textarea" ? <><textarea className={`${inputClass} mt-1 min-h-20`} value={itemValue} maxLength={max} onChange={(event) => updateItemField(index, itemField.key, event.currentTarget.value, itemField.aliases)} /><Counter current={itemValue.length} max={max} /></> : itemField.kind === "image" ? <MediaUploadField label={itemField.label} value={itemValue} tenantId={tenantId} folderSubpath="website" onChange={(url) => updateItemField(index, itemField.key, url, itemField.aliases)} /> : <><input className={`${inputClass} mt-1`} value={itemValue} maxLength={max} onChange={(event) => updateItemField(index, itemField.key, event.currentTarget.value, itemField.aliases)} /><Counter current={itemValue.length} max={max} /></>}</label>;
                })}
              </div>
            );
          })}
          <p className="text-right text-[11px] text-zinc-500">{Array.isArray(value) ? value.length : 0}/{control.max ?? BLOCK_LIMITS.MAX_ARRAY_ITEMS}</p>
          {(Array.isArray(value) ? value.length : 0) < (control.max ?? BLOCK_LIMITS.MAX_ARRAY_ITEMS) ? <button type="button" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" onClick={() => onChange([...(Array.isArray(value) ? value : []), {}])}>Add item</button> : null}
          {Array.isArray(value) && value.length > 0 ? <button type="button" className="ml-2 text-xs font-medium text-rose-600" onClick={() => onChange([])}>Clear all</button> : null}
        </div>
      ) : null}

      {control.kind === "pick" ? (() => {
        const featured = record(value);
        const selected = Array.isArray(featured.menu_item_ids) ? featured.menu_item_ids.filter((id): id is string => typeof id === "string") : [];
        const limit = control.max ?? BLOCK_LIMITS.MAX_ARRAY_ITEMS;
        return (
          <div className="space-y-3">
            {onOpenMenuEditor && canManageMenu ? (
              <div>
                <button
                  type="button"
                  onClick={onOpenMenuEditor}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  <UtensilsCrossed className="h-3.5 w-3.5 text-orange-600" />
                  {tStorefront("manageFullMenu")}
                </button>
              </div>
            ) : null}
            <div className="space-y-2">
              {menuItems.map((item) => {
                const checked = selected.includes(item.id);
                return <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700"><input type="checkbox" checked={checked} disabled={!checked && selected.length >= limit} onChange={(event) => {
                  const next = event.currentTarget.checked ? [...selected, item.id].slice(0, limit) : selected.filter((id) => id !== item.id);
                  onChange({ ...featured, menu_item_ids: next });
                }} /><span className="min-w-0 flex-1"><span className="block font-medium text-zinc-800 dark:text-zinc-100">{item.name}</span><span className="block text-xs text-zinc-500">{item.sectionName}{item.price != null ? ` · ${Number(item.price).toFixed(2)}` : ""}</span></span></label>;
              })}
              {menuItems.length === 0 ? <p className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">There are no active menu items to pick yet.</p> : null}
            </div>
            <p className="text-right text-[11px] text-zinc-500">{selected.length}/{limit}</p>
          </div>
        );
      })() : null}

      {control.kind === "hours" ? (() => {
        const hours = record(value);
        return <div className="space-y-2">
          {DAYS.map(([day, dayKey]) => {
            const dayLabel = tStorefront(dayKey);
            const row = record(hours[day]);
            const closed = row.closed === true;
            return <div key={day} className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"><span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{dayLabel}</span><label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={closed} onChange={(event) => onChange({ ...hours, [day]: event.currentTarget.checked ? { closed: true } : {} })} />{tStorefront("closed")}</label><input aria-label={`${dayLabel} ${tStorefront("opens")}`} className={inputClass} type="time" step={900} disabled={closed} value={typeof row.open === "string" ? row.open : ""} onChange={(event) => onChange({ ...hours, [day]: { ...row, closed: false, open: event.currentTarget.value } })} /><input aria-label={`${dayLabel} ${tStorefront("closes")}`} className={inputClass} type="time" step={900} disabled={closed} value={typeof row.close === "string" ? row.close : ""} onChange={(event) => onChange({ ...hours, [day]: { ...row, closed: false, close: event.currentTarget.value } })} /></div>;
          })}
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">{tStorefront("highlightText")}<input className={`${inputClass} mt-1`} maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH} value={typeof hours.today_tag === "string" ? hours.today_tag : ""} onChange={(event) => onChange({ ...hours, today_tag: event.currentTarget.value })} /><Counter current={typeof hours.today_tag === "string" ? hours.today_tag.length : 0} max={BLOCK_LIMITS.LABEL_MAX_LENGTH} /></label>
        </div>;
      })() : null}

      {control.kind === "socials" ? (() => {
        const socials = record(value);
        return <div className="space-y-3">{SOCIALS.map(([network, networkLabel]) => {
          const current = typeof socials[network] === "string" ? socials[network] as string : "";
          return <label key={network} className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">{networkLabel}<input className={`${inputClass} mt-1`} type="url" value={current} maxLength={BLOCK_LIMITS.URL_MAX_LENGTH} onChange={(event) => onChange({ ...socials, [network]: event.currentTarget.value })} onBlur={() => onChange({ ...socials, [network]: current.trim() ? sanitizeUrl(current) : "" })} /><Counter current={current.length} max={BLOCK_LIMITS.URL_MAX_LENGTH} /></label>;
        })}</div>;
      })() : null}

      {control.kind === "nav-labels" ? (() => {
        const labels = record(value);
        const entries = template.navigation.map((entry) => {
          const key = entry.anchor === "how-it-works"
            ? "how"
            : entry.anchor ?? entry.pageSlug ?? entry.href ?? "home";
          const initial = typeof labels[key] === "string" ? labels[key] as string : entry.label;
          return { key, initial };
        });
        const unique = [...new Map(entries.map((entry) => [entry.key, entry])).values()];
        return <div className="space-y-3">{unique.map(({ key, initial }) => {
          const current = typeof labels[key] === "string" ? labels[key] as string : initial;
          return <label key={key} className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">{initial}<input className={`${inputClass} mt-1`} maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH} value={current} onChange={(event) => onChange({ ...labels, [key]: event.currentTarget.value })} /><Counter current={current.length} max={BLOCK_LIMITS.LABEL_MAX_LENGTH} /></label>;
        })}</div>;
      })() : null}
    </fieldset>
  );
}
