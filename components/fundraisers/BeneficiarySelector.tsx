"use client";

import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import {
  BENEFICIARY_TYPE_CONFIG,
  BENEFICIARY_TYPE_OPTIONS,
  RELATIONSHIP_SUGGESTIONS,
  type BeneficiaryType,
} from "@/lib/beneficiary";

/**
 * Flat form state for the beneficiary step. Kept flat (rather than the nested
 * stored shape) so it maps 1:1 onto inputs; `validateBeneficiary` converts it
 * into the stored object, dropping fields that don't apply to the chosen type.
 */
export type BeneficiaryDraft = {
  type: BeneficiaryType | null;
  name: string;
  relationship: string;
  description: string;
  website: string;
  registrationNumber: string;
  species: string;
  photo: string;
};

export const EMPTY_BENEFICIARY_DRAFT: BeneficiaryDraft = {
  type: null,
  name: "",
  relationship: "",
  description: "",
  website: "",
  registrationNumber: "",
  species: "",
  photo: "",
};

interface BeneficiarySelectorProps {
  value: BeneficiaryDraft;
  onChange: (next: BeneficiaryDraft) => void;
  /** Used to auto-fill the name when "Myself" is chosen. */
  organizerName?: string;
  /** Input styling from the surrounding flow, so this matches its design. */
  inputClassName: string;
  onError?: (message: string) => void;
}

/**
 * "Who are you fundraising for?" — segmented type cards plus progressive
 * disclosure of only the fields that type needs. Inline (no modal), two
 * columns on desktop and stacked on mobile, with touch targets well above
 * the 44px minimum.
 */
export default function BeneficiarySelector({
  value,
  onChange,
  organizerName,
  inputClassName,
  onError,
}: BeneficiarySelectorProps) {
  const config = value.type ? BENEFICIARY_TYPE_CONFIG[value.type] : null;
  const shows = (field: string) => Boolean(config?.fields.includes(field as never));

  function selectType(type: BeneficiaryType) {
    onChange({
      ...value,
      type,
      // "Myself" carries no extra fields — the beneficiary is the organizer,
      // so the name is derived rather than asked for again.
      name: type === "self" ? (organizerName ?? "").trim() : value.name,
    });
  }

  function update<K extends keyof BeneficiaryDraft>(key: K, next: BeneficiaryDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label="Who are you fundraising for?"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {BENEFICIARY_TYPE_OPTIONS.map((option) => {
          const isSelected = value.type === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => selectType(option.value)}
              className={`flex min-h-[64px] flex-col justify-center rounded-2xl border-2 px-4 py-3 text-left transition ${
                isSelected
                  ? "border-brand-700 bg-brand-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <span
                className={`text-sm font-black ${
                  isSelected ? "text-brand-800" : "text-zinc-900"
                }`}
              >
                {option.label}
              </span>
              <span className="mt-0.5 text-xs font-medium text-zinc-500">
                {option.helper}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progressive disclosure — nothing below appears until a type is picked. */}
      {config && (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5">
          {config.value === "self" ? (
            <p className="text-sm font-semibold text-zinc-600">
              This fundraiser will be listed as helping{" "}
              <span className="font-black text-zinc-950">
                {(organizerName ?? "").trim() || "you"}
              </span>
              .
            </p>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                {config.nameLabel} *
              </span>
              <input
                value={value.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder={config.namePlaceholder}
                className={inputClassName}
              />
            </label>
          )}

          {shows("relationship") && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Relationship to you
              </span>
              <input
                value={value.relationship}
                onChange={(e) => update("relationship", e.target.value)}
                placeholder="Mother"
                list="beneficiary-relationship-suggestions"
                className={inputClassName}
              />
              {/* Free text with hints rather than a fixed dropdown — real
                  relationships are too varied to enumerate honestly. */}
              <datalist id="beneficiary-relationship-suggestions">
                {RELATIONSHIP_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </label>
          )}

          {shows("species") && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Species
              </span>
              <input
                value={value.species}
                onChange={(e) => update("species", e.target.value)}
                placeholder="Dog"
                className={inputClassName}
              />
            </label>
          )}

          {shows("registrationNumber") && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Charity registration number
              </span>
              <input
                value={value.registrationNumber}
                onChange={(e) => update("registrationNumber", e.target.value)}
                placeholder="Optional"
                className={inputClassName}
              />
            </label>
          )}

          {shows("website") && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Website
              </span>
              <input
                value={value.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="Optional"
                className={inputClassName}
              />
            </label>
          )}

          {shows("description") && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Description
              </span>
              <textarea
                value={value.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                placeholder="Optional — a little more about who this helps"
                className={inputClassName}
              />
            </label>
          )}

          {shows("photo") && (
            <div>
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Photo
              </span>
              <div className="flex items-center gap-3">
                <ImageUploadWithCrop
                  value={value.photo || undefined}
                  bucket="fundraiser-media"
                  folder="beneficiary-photos"
                  aspectRatio={1}
                  cropShape="round"
                  previewClassName="h-16 w-16 rounded-full"
                  onUploaded={(url) => update("photo", url)}
                  onError={onError}
                  label={value.photo ? "Change photo" : "Add photo"}
                />
                {value.photo && (
                  <button
                    type="button"
                    onClick={() => update("photo", "")}
                    className="shrink-0 text-xs font-black text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
