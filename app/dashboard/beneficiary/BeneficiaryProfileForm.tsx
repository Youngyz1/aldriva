"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import { beneficiaryTypeLabel, isBeneficiaryType } from "@/lib/beneficiary";

type Profile = {
  id: string;
  type: string;
  name: string;
  relationship: string | null;
  species: string | null;
  photo: string | null;
  bio: string | null;
  contact_email: string | null;
  website: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  linkedin: string | null;
  youtube: string | null;
  tiktok: string | null;
  verified_at: string | null;
};

type Campaign = { id: string; title: string; slug: string; organizer: string | null };

const fieldClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-100";

const SOCIAL_FIELDS = [
  ["website", "Website"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["twitter", "X / Twitter"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
] as const;

/**
 * Self-service editor for a claimed beneficiary profile.
 *
 * Writes go through the browser client so the update is subject to the RLS
 * policy from migration_51 — the database, not this form, is what guarantees
 * a beneficiary can only ever edit their own row. Name and type are shown
 * read-only: they describe who the campaign is for and belong to the
 * organizer's campaign setup, not to the beneficiary's profile.
 */
export default function BeneficiaryProfileForm({
  profile,
  campaigns,
}: {
  profile: Profile;
  campaigns: Campaign[];
}) {
  const [form, setForm] = useState({
    photo: profile.photo ?? "",
    bio: profile.bio ?? "",
    contact_email: profile.contact_email ?? "",
    website: profile.website ?? "",
    facebook: profile.facebook ?? "",
    twitter: profile.twitter ?? "",
    instagram: profile.instagram ?? "",
    linkedin: profile.linkedin ?? "",
    youtube: profile.youtube ?? "",
    tiktok: profile.tiktok ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const { error: updateError } = await supabase
      .from("beneficiaries")
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (updateError) setError(updateError.message);
    else setSaved(true);
    setSaving(false);
  }

  const typeLabel = isBeneficiaryType(profile.type)
    ? beneficiaryTypeLabel(profile.type)
    : profile.type;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-zinc-950">{profile.name}</h2>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-zinc-500">
            {typeLabel}
            {profile.relationship ? ` · ${profile.relationship}` : ""}
            {profile.species ? ` · ${profile.species}` : ""}
          </p>
        </div>
        {profile.verified_at && (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-800">
            Verified
          </span>
        )}
      </div>

      {campaigns.length > 0 && (
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-500">
            Raising for you
          </p>
          <ul className="mt-2 space-y-1">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="truncate text-sm font-semibold">
                <Link
                  href={`/fundraisers/${campaign.slug}`}
                  className="text-zinc-800 hover:text-brand-700 hover:underline"
                >
                  {campaign.title}
                </Link>
                {campaign.organizer && (
                  <span className="text-zinc-500"> · by {campaign.organizer}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">
          Profile saved.
        </p>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
          Photo
        </span>
        <div className="flex items-center gap-3">
          <ImageUploadWithCrop
            value={form.photo || undefined}
            bucket="fundraiser-media"
            folder="beneficiary-photos"
            aspectRatio={1}
            cropShape="round"
            previewClassName="h-16 w-16 rounded-full"
            onUploaded={(url) => update("photo", url)}
            onError={setError}
            label={form.photo ? "Change photo" : "Add photo"}
          />
          {form.photo && (
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

      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
          About you
        </span>
        <textarea
          value={form.bio}
          onChange={(e) => update("bio", e.target.value)}
          rows={4}
          placeholder="Tell supporters a little about yourself"
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
          Contact email
        </span>
        <input
          type="email"
          value={form.contact_email}
          onChange={(e) => update("contact_email", e.target.value)}
          placeholder="Shown publicly so supporters can reach you"
          className={fieldClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIAL_FIELDS.map(([key, label]) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
              {label}
            </span>
            <input
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[48px] rounded-full bg-brand-700 px-6 py-3 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
