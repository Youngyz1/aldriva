"use client";

import { useTranslations } from "next-intl";
import { IconPlus as Plus, IconTrash as Trash2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { BuilderDraft } from "../InvitationPageBuilder";
import {
  getInvitationTemplateManifest,
  resolveManifestLabel,
  type ManifestField,
} from "@/lib/invitation-template-manifests";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";
import { InvitationFocalPicker } from "@/components/invitation/InvitationFocalPicker";
import { useInvitationBuilderPersistence } from "@/components/invitation/InvitationBuilderPersistenceContext";
import { normalizeInvitationColorHex } from "@/lib/invitation-colors";
import { getMemorySettingsState } from "@/lib/actions/event-memories";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

type ManifestImageItem = { url: string | null; focal?: { x: number; y: number }; alt?: string | null };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function readTemplateData(draft: BuilderDraft): Record<string, unknown> {
  const bl = draft.blocks_layout as Record<string, unknown> | null | undefined;
  return asRecord(bl?.template_data);
}

function updateTemplateDataField(draft: BuilderDraft, updateDraft: Props["updateDraft"], path: string, value: unknown) {
  const layout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
  updateDraft({
    blocks_layout: {
      ...layout,
      template_data: { ...(layout.template_data ?? {}), [path]: value },
    },
  });
}

function readFieldValue(draft: BuilderDraft, field: ManifestField): unknown {
  if (field.storage.kind === "column") return (draft as unknown as Record<string, unknown>)[field.storage.column];
  return readTemplateData(draft)[field.storage.path];
}

function writeFieldValue(draft: BuilderDraft, updateDraft: Props["updateDraft"], field: ManifestField, value: unknown) {
  if (field.storage.kind === "column") {
    updateDraft({ [field.storage.column]: value } as Partial<BuilderDraft>);
  } else {
    updateTemplateDataField(draft, updateDraft, field.storage.path, value);
  }
}

function label(field: ManifestField, t: (k: any) => string, locale: "en" | "fr") {
  return resolveManifestLabel(field.label, t, locale);
}

function groupLabel(field: ManifestField, t: (k: any) => string, locale: "en" | "fr") {
  return resolveManifestLabel(field.groupLabel, t, locale);
}

export function TemplateFieldsSection({ eventId, draft, updateDraft, disabled }: Props) {
  const t = useTranslations("Events");
  const locale = (draft.locale === "fr" ? "fr" : "en") as "en" | "fr";
  const persistence = useInvitationBuilderPersistence();
  const manifest = getInvitationTemplateManifest(draft.template_id);
  const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const hasMemoriesField = Boolean(manifest?.fields.some((field) => field.key === "mf_show_memories"));
  const [requireApproval, setRequireApproval] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hasMemoriesField) return;
    let cancelled = false;
    getMemorySettingsState(eventId)
      .then((state) => {
        if (cancelled || !state.ok) return;
        setRequireApproval(state.requireApproval !== false);
      })
      .catch(() => {
        /* Unknown approval state: no warning rather than a false alarm. */
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, hasMemoriesField]);

  if (!manifest) return null;

  const groups: { id: string; label: string; fields: ManifestField[] }[] = [];
  for (const f of manifest.fields) {
    let g = groups.find((x) => x.id === f.group);
    if (!g) { g = { id: f.group, label: groupLabel(f, t, locale), fields: [] }; groups.push(g); }
    g.fields.push(f);
  }

  function renderText(field: ManifestField) {
    const value = (readFieldValue(draft, field) as string | null | undefined) ?? "";
    const id = `mf-${field.key}`;
    return (
      <div key={field.key} className="space-y-1.5">
        <label htmlFor={id} className="text-xs font-bold text-zinc-700">
          {label(field, t, locale)}
        </label>
        <input
          id={id}
          type="text"
          maxLength={field.maxLength ?? 200}
          disabled={disabled}
          value={value}
          onChange={(e) => writeFieldValue(draft, updateDraft, field, e.target.value || null)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>
    );
  }

  function renderTextarea(field: ManifestField) {
    const value = (readFieldValue(draft, field) as string | null | undefined) ?? "";
    const id = `mf-${field.key}`;
    return (
      <div key={field.key} className="space-y-1.5">
        <label htmlFor={id} className="text-xs font-bold text-zinc-700">
          {label(field, t, locale)}
        </label>
        <textarea
          id={id}
          maxLength={field.maxLength ?? 500}
          disabled={disabled}
          rows={3}
          value={value}
          onChange={(e) => writeFieldValue(draft, updateDraft, field, e.target.value || null)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>
    );
  }

  function renderToggle(field: ManifestField) {
    const raw = readFieldValue(draft, field);
    const checked =
      raw === undefined || raw === null
        ? (field.defaultValue ?? field.sampleValue === true)
        : raw === true;
    const id = `mf-${field.key}`;
    const helper = field.helper ? resolveManifestLabel(field.helper, t, locale) : null;
    const showNoApprovalWarning =
      field.key === "mf_show_memories" && checked && requireApproval === false;
    return (
      <div key={field.key} className="space-y-1.5">
        <label htmlFor={id} className="flex items-center gap-2 text-xs font-bold text-zinc-700">
          <input
            id={id}
            type="checkbox"
            disabled={disabled}
            checked={checked}
            onChange={(e) => writeFieldValue(draft, updateDraft, field, e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
          />
          {label(field, t, locale)}
        </label>
        {helper ? <p className="pl-6 text-[11px] leading-4 text-zinc-500">{helper}</p> : null}
        {showNoApprovalWarning ? (
          <p role="status" className="ml-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-800">
            {t("manifestShowMemoriesNoApprovalWarning")}
          </p>
        ) : null}
      </div>
    );
  }

  function renderImageList(field: ManifestField) {
    const max = typeof field.max === "number" ? field.max : 2;
    const min = typeof field.min === "number" ? field.min : 1;
    const raw = readFieldValue(draft, field);
    const items: ManifestImageItem[] = Array.isArray(raw)
      ? (raw as unknown[]).map((it) => {
          const r = asRecord(it);
          return {
            url: typeof r.url === "string" ? r.url : null,
            focal: asRecord(r.focal).x != null ? { x: Number(asRecord(r.focal).x), y: Number(asRecord(r.focal).y) } : { x: 50, y: 50 },
            alt: typeof r.alt === "string" ? r.alt : null,
          };
        })
      : [];
    // ensure at least min slots shown
    while (items.length < Math.min(min, max)) items.push({ url: null, focal: { x: 50, y: 50 }, alt: null });
    if (items.length === 0) items.push({ url: null, focal: { x: 50, y: 50 }, alt: null });

    function commit(next: ManifestImageItem[]) {
      writeFieldValue(draft, updateDraft, field, next);
    }

    return (
      <div key={field.key} className="space-y-4">
        <p className="text-xs font-bold text-zinc-700">{label(field, t, locale)}</p>
        {items.map((item, idx) => {
          const slotLabel = field.slotLabels?.[idx] ? resolveManifestLabel(field.slotLabels[idx], t, locale) : `${label(field, t, locale)} ${idx + 1}`;
          return (
            <section key={idx} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-zinc-800">{slotLabel}</h4>
                {items.length > min && idx >= min ? (
                  <button type="button" disabled={disabled} onClick={() => commit(items.filter((_, i) => i !== idx))}
                    className="flex items-center gap-1 rounded-lg text-[11px] font-semibold text-zinc-500 hover:text-red-600 disabled:opacity-50">
                    <Trash2 size={13} /> {t("invitationGalleryRemove")}
                  </button>
                ) : item.url ? (
                  <button type="button" disabled={disabled} onClick={() => { const next = [...items]; next[idx] = { ...next[idx], url: null }; commit(next); }}
                    className="flex items-center gap-1 rounded-lg text-[11px] font-semibold text-zinc-500 hover:text-red-600 disabled:opacity-50">
                    <Trash2 size={13} /> {t("invitationGalleryRemove")}
                  </button>
                ) : null}
              </div>
              <InvitationImageUploadField
                value={item.url}
                folder={`invitation-manifest/${eventId}/${field.key}`}
                label={slotLabel}
                disabled={disabled}
                onUploaded={(url) => { const next = [...items]; next[idx] = { ...next[idx], url }; commit(next); }}
                onRemove={() => { const next = [...items]; next[idx] = { ...next[idx], url: null }; commit(next); }}
                onLocalCropped={
                  persistence.mode === "local"
                    ? (file, previewUrl) => {
                        const errorKey = `${field.key}_${idx}`;
                        persistence.handleLocalImageCropped?.(
                          errorKey, file, previewUrl,
                          (url) => {
                            setImageErrors((prev) => { const nextErrors = { ...prev }; delete nextErrors[errorKey]; return nextErrors; });
                            const next = [...items]; next[idx] = { ...next[idx], url }; commit(next);
                          },
                          (message) => setImageErrors((prev) => ({ ...prev, [errorKey]: message }))
                        );
                      }
                    : undefined
                }
              />
              {imageErrors[`${field.key}_${idx}`] ? (
                <p className="text-xs font-semibold text-red-600">{imageErrors[`${field.key}_${idx}`]}</p>
              ) : null}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-600">{locale === "fr" ? "Texte alternatif (optionnel)" : "Alt text (optional)"}</label>
                <input type="text" maxLength={160} disabled={disabled} value={item.alt ?? ""}
                  onChange={(e) => { const next = [...items]; next[idx] = { ...next[idx], alt: e.target.value || null }; commit(next); }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none disabled:bg-zinc-50" />
              </div>
              <InvitationFocalPicker
                imageUrl={item.url}
                focal={item.focal ?? { x: 50, y: 50 }}
                onChange={(focal) => { const next = [...items]; next[idx] = { ...next[idx], focal }; commit(next); }}
                templateId={draft.template_id}
                disabled={disabled}
              />
            </section>
          );
        })}
        {items.length < max ? (
          <button type="button" disabled={disabled}
            onClick={() => commit([...items, { url: null, focal: { x: 50, y: 50 }, alt: null }])}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50">
            <Plus size={13} /> {field.slotLabels?.[items.length] ? resolveManifestLabel(field.slotLabels[items.length], t, locale) : (locale === "fr" ? "Ajouter une photo" : "Add photo")}
          </button>
        ) : null}
      </div>
    );
  }

  function renderColorList(field: ManifestField) {
    const max = typeof field.max === "number" ? field.max : 5;
    const raw = readFieldValue(draft, field);
    const colors: Array<{ name?: string | null; hex: string }> = Array.isArray(raw)
      ? (raw as unknown[]).map((it) => {
          const r = asRecord(it);
          return { name: typeof r.name === "string" ? r.name : null, hex: typeof r.hex === "string" ? r.hex : "#14305a" };
        })
      : [];

    function commit(next: Array<{ name?: string | null; hex: string }>) {
      writeFieldValue(draft, updateDraft, field, next);
    }

    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-700">{label(field, t, locale)}</p>
          {colors.length < max ? (
            <button type="button" disabled={disabled}
              onClick={() => commit([...colors, { name: "", hex: "#14305a" }])}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50">
              <Plus size={13} /> {locale === "fr" ? "Ajouter" : "Add color"}
            </button>
          ) : null}
        </div>
        {colors.map((c, i) => {
          const draftKey = `${field.key}-${i}`;
          return (
            <div key={i} className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
              <div className="relative row-span-2 h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-300 shadow-inner"
                style={{ backgroundColor: normalizeInvitationColorHex(c.hex) ?? "#FFFFFF" }}>
                <input type="color" disabled={disabled} aria-label={`Color ${i + 1}`}
                  value={normalizeInvitationColorHex(c.hex) ?? "#FFFFFF"}
                  onChange={(e) => {
                    setHexDrafts((cur) => { const n = { ...cur }; delete n[draftKey]; return n; });
                    const next = [...colors]; next[i] = { ...next[i], hex: e.target.value.toUpperCase() }; commit(next);
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </div>
              <input type="text" maxLength={30} disabled={disabled} placeholder={locale === "fr" ? "Nom" : "Name"}
                value={c.name || ""}
                onChange={(e) => { const next = [...colors]; next[i] = { ...next[i], name: e.target.value || null }; commit(next); }}
                className="min-w-0 w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none" />
              <input type="text" maxLength={7} disabled={disabled} inputMode="text"
                value={hexDrafts[draftKey] ?? c.hex}
                onChange={(e) => {
                  const value = e.target.value;
                  setHexDrafts((cur) => ({ ...cur, [draftKey]: value }));
                  const normalized = normalizeInvitationColorHex(value);
                  if (normalized) { const next = [...colors]; next[i] = { ...next[i], hex: normalized }; commit(next); }
                }}
                onBlur={() => {
                  const normalized = normalizeInvitationColorHex(hexDrafts[draftKey] ?? c.hex);
                  if (normalized) { const next = [...colors]; next[i] = { ...next[i], hex: normalized }; commit(next); }
                  setHexDrafts((cur) => { const n = { ...cur }; delete n[draftKey]; return n; });
                }}
                className="col-start-2 row-start-2 min-w-0 w-full rounded-lg border border-zinc-200 px-2.5 py-2 font-mono text-xs uppercase text-zinc-900 focus:border-orange-500 focus:outline-none" />
              <button type="button" disabled={disabled} onClick={() => commit(colors.filter((_, j) => j !== i))}
                aria-label={`Remove color ${i + 1}`}
                className="col-start-3 row-span-2 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function renderField(field: ManifestField) {
    switch (field.type) {
      case "text": return renderText(field);
      case "textarea": return renderTextarea(field);
      case "toggle": return renderToggle(field);
      case "image-list": return renderImageList(field);
      case "color-list": return renderColorList(field);
      default: return null;
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.id} className="space-y-4 border-t border-zinc-200 pt-4 first:border-t-0 first:pt-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{g.label}</h3>
          {g.fields.map((f) => renderField(f))}
        </div>
      ))}
    </div>
  );
}
