"use client";

import { ImageUploader } from "@/components/shared/ImageUploader";
import { MAX_PREVIEW_IMAGES } from "@/lib/products-constants";
import {
  DIGITAL_LICENSES,
  DIGITAL_LICENSE_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
} from "@/lib/digital-products";

export type DigitalFormState = {
  product_type: string;
  subtitle: string;
  category: string;
  tags: string;
  cover_image_url: string;
  license: string;
  version: string;
  update_policy: string;
  preview_images: string[];
};

export const EMPTY_DIGITAL_STATE: DigitalFormState = {
  product_type: "other",
  subtitle: "",
  category: "",
  tags: "",
  cover_image_url: "",
  license: "personal",
  version: "1.0",
  update_policy: "",
  preview_images: [],
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20";
const labelClass = "block text-sm font-black text-zinc-600 mb-1";

/**
 * Shared digital-listing fields for the new/edit product forms.
 * Fully controlled via `value`/`onChange`; product_type "other" preserves
 * the legacy physical/subscription listing (no digital behavior attached).
 */
export default function DigitalProductFields({
  value,
  onChange,
  onError,
}: {
  value: DigitalFormState;
  onChange: (next: DigitalFormState) => void;
  onError: (msg: string) => void;
}) {
  function set<K extends keyof DigitalFormState>(key: K, v: DigitalFormState[K]) {
    onChange({ ...value, [key]: v });
  }

  function removePreview(index: number) {
    set(
      "preview_images",
      value.preview_images.filter((_, i) => i !== index)
    );
  }

  const atPreviewLimit = value.preview_images.length >= MAX_PREVIEW_IMAGES;

  return (
    <div className="space-y-4 border-t border-zinc-200 pt-6">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">
        Digital Product Details
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Product Type *</label>
          <select
            value={value.product_type}
            onChange={(e) => set("product_type", e.target.value)}
            className={`${inputClass} bg-slate-50`}
          >
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Choose &ldquo;Other&rdquo; for physical merchandise or anything with inventory.
          </p>
        </div>

        <div>
          <label className={labelClass}>License</label>
          <select
            value={value.license}
            onChange={(e) => set("license", e.target.value)}
            className={`${inputClass} bg-slate-50`}
          >
            {DIGITAL_LICENSES.map((l) => (
              <option key={l} value={l}>
                {DIGITAL_LICENSE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Subtitle</label>
        <input
          type="text"
          value={value.subtitle}
          onChange={(e) => set("subtitle", e.target.value)}
          placeholder="e.g. Everything you need to open your first restaurant"
          maxLength={180}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Category</label>
          <input
            type="text"
            value={value.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="e.g. Business, Cooking, Design"
            maxLength={80}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Version</label>
          <input
            type="text"
            value={value.version}
            onChange={(e) => set("version", e.target.value)}
            placeholder="1.0"
            maxLength={20}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Tags</label>
        <input
          type="text"
          value={value.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="Comma-separated, e.g. restaurant, startup, checklist"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Update Policy</label>
        <textarea
          value={value.update_policy}
          onChange={(e) => set("update_policy", e.target.value)}
          placeholder="e.g. Free updates for 12 months after purchase"
          rows={2}
          maxLength={500}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Cover Image</label>
        {value.cover_image_url ? (
          <div className="mb-3 flex items-start gap-3">
            <img
              src={value.cover_image_url}
              alt="Product cover"
              className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
            />
            <button
              type="button"
              onClick={() => set("cover_image_url", "")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Remove
            </button>
          </div>
        ) : null}
        <ImageUploader
          label={value.cover_image_url ? "Replace Cover" : "+ Add Cover"}
          bucket="fundraiser-media"
          folder="product-covers"
          onUploaded={(url) => set("cover_image_url", url)}
          onError={onError}
        />
        <p className="text-xs text-slate-400 mt-1">
          Square works best. Shown on the product page and in your library.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-black text-zinc-600">Preview Images</label>
          <span className="text-xs font-bold text-zinc-400">
            {value.preview_images.length}/{MAX_PREVIEW_IMAGES}
          </span>
        </div>
        {value.preview_images.length > 0 && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            {value.preview_images.map((url, i) => (
              <div
                key={url + i}
                className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePreview(i)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-black text-white opacity-0 transition group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <ImageUploader
          label={atPreviewLimit ? `Maximum ${MAX_PREVIEW_IMAGES} previews reached` : "+ Add Preview"}
          disabled={atPreviewLimit}
          bucket="fundraiser-media"
          folder="product-previews"
          onUploaded={(url) => set("preview_images", [...value.preview_images, url])}
          onError={onError}
        />
        <p className="text-xs text-slate-400 mt-1">
          Sample pages or screenshots buyers can see before purchasing. Never upload full paid files here.
        </p>
      </div>
    </div>
  );
}
