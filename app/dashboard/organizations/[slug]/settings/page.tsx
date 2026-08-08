"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ORGANIZER_PUBLIC_COLUMNS } from "@/lib/organizer-public-columns";
import { MIN_BANNER_WIDTH, MIN_BANNER_HEIGHT } from "@/lib/image-dimensions";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";
import {
  Globe, Mail, AlertTriangle, Check, ArrowRight, ShieldCheck, Loader2
} from "lucide-react";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";

const ORGANIZER_BANNER_ASPECT = MIN_BANNER_WIDTH / MIN_BANNER_HEIGHT; // 4:1

type OrgForm = {
  name: string;
  slug: string;
  bio: string;
  photo: string;
  banner: string;
  org_type: string;
  contact_email: string;
  website: string;
  facebook: string;
  twitter: string;
  instagram: string;
  linkedin: string;
  youtube: string;
  tiktok: string;
  visibility: "public" | "private";
};

const ORG_TYPES = [
  { value: "nonprofit", label: "Nonprofit" },
  { value: "business", label: "Business" },
  { value: "church", label: "Church" },
  { value: "school", label: "School" },
  { value: "creator", label: "Creator" },
  { value: "community", label: "Community" },
  { value: "government", label: "Government" },
  { value: "restaurant", label: "Restaurant" },
  { value: "sports_club", label: "Sports Club" },
  { value: "other", label: "Other" },
];

export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const originalSlug = params?.slug as string;

  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const [form, setForm] = useState<OrgForm>({
    name: "",
    slug: "",
    bio: "",
    photo: "",
    banner: "",
    org_type: "other",
    contact_email: "",
    website: "",
    facebook: "",
    twitter: "",
    instagram: "",
    linkedin: "",
    youtube: "",
    tiktok: "",
    visibility: "public",
  });

  // Load organization details
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Explicit columns: migration_53's column grants make select("*") on
      // organizers fail even for the row's owner — the grant applies to the
      // `authenticated` role, not per-row. This form never edits the revoked
      // columns (tax_id, nonprofit_registration_number).
      const { data: org, error: orgError } = await supabase
        .from("organizers")
        .select(ORGANIZER_PUBLIC_COLUMNS)
        .eq("slug", originalSlug)
        .eq("user_id", session.user.id)
        .single();

      if (orgError || !org) {
        setError("Organization not found or you do not have permission to edit it.");
        setLoading(false);
        return;
      }

      setOrgId(org.id);
      setForm({
        name: org.name || "",
        slug: org.slug || "",
        bio: org.bio || "",
        photo: org.photo || "",
        banner: org.banner || "",
        org_type: org.org_type || "other",
        contact_email: org.contact_email || "",
        website: org.website || "",
        facebook: org.facebook || "",
        twitter: org.twitter || "",
        instagram: org.instagram || "",
        linkedin: org.linkedin || "",
        youtube: org.youtube || "",
        tiktok: org.tiktok || "",
        visibility: (org.visibility as "public" | "private") || "public",
      });
      setLoading(false);
    }
    if (originalSlug) load();
  }, [originalSlug, router]);

  function update(field: keyof OrgForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleCroppedPhoto(file: File, previewUrl: string) {
    setPhotoFile(file);
    setPhotoPreview(previewUrl);
  }

  function handleCroppedBanner(file: File, previewUrl: string) {
    setError("");
    setBannerFile(file);
    setBannerPreview(previewUrl);
  }

  async function uploadFile(file: File, bucket: string, prefix: string) {
    if (!orgId) throw new Error("Org ID is missing.");
    try {
      return await uploadImage(file, bucket, `${prefix}-${orgId}`);
    } catch (err) {
      throw new Error(err instanceof UploadImageError ? err.message : "Upload failed.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    // Validate Slug format (lowercase, numbers, dashes only)
    const slugFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugFormat.test(form.slug)) {
      setError("Slug must contain only lowercase letters, numbers, and single hyphens (e.g. 'my-org-name').");
      setSaving(false);
      return;
    }

    try {
      // Check slug uniqueness if changed
      if (form.slug !== originalSlug) {
        const { data: existing } = await supabase
          .from("organizers")
          .select("id")
          .eq("slug", form.slug)
          .maybeSingle();

        if (existing) {
          setError("This URL slug is already taken by another organization.");
          setSaving(false);
          return;
        }
      }

      let photo = form.photo;
      let banner = form.banner;

      if (photoFile) {
        photo = await uploadFile(photoFile, "organizer-images", "photo");
      }
      if (bannerFile) {
        banner = await uploadFile(bannerFile, "organizer-banners", "banner");
      }

      const { error: updateError } = await supabase
        .from("organizers")
        .update({
          name: form.name,
          slug: form.slug,
          bio: form.bio,
          photo,
          banner,
          org_type: form.org_type,
          contact_email: form.contact_email,
          website: form.website,
          facebook: form.facebook,
          twitter: form.twitter,
          instagram: form.instagram,
          linkedin: form.linkedin,
          youtube: form.youtube,
          tiktok: form.tiktok,
          visibility: form.visibility,
        })
        .eq("id", orgId);

      if (updateError) throw new Error(updateError.message);

      setSuccess(true);

      // If slug was changed, redirect to new dashboard settings URL
      if (form.slug !== originalSlug) {
        router.push(`/dashboard/organizations/${form.slug}/settings`);
      } else {
        // Just reload details
        setForm((prev) => ({ ...prev, photo, banner }));
        setPhotoFile(null);
        setBannerFile(null);
        setPhotoPreview(null);
        setBannerPreview(null);
      }
    } catch (err: any) {
      setError(err?.message || "Could not update settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization Workspace</p>
          <h1 className="mt-1 text-2xl font-black">Settings</h1>
          <p className="text-sm font-medium text-zinc-500">Manage profile information, logo, banner, type, and links.</p>
        </div>
        <a
          href={`/organizations/${form.slug}`}
          target="_blank"
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
        >
          View Public Profile ↗
        </a>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          Settings updated successfully!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* 1. Identity & General */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-black text-zinc-950">General Info</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Organization Name *</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Organization Type *</span>
              <select
                required
                value={form.org_type}
                onChange={(e) => update("org_type", e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              >
                {ORG_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-zinc-600">Public URL Slug *</span>
            <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 focus-within:border-orange-500 focus-within:bg-white overflow-hidden">
              <span className="flex items-center bg-zinc-100 px-3 text-xs font-bold text-zinc-500 border-r border-zinc-200">
                /organizations/
              </span>
              <input
                type="text"
                required
                value={form.slug}
                onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                className="w-full bg-transparent px-4 py-2.5 text-sm outline-none"
              />
            </div>
            {form.slug !== originalSlug && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-lg p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Changing your slug will change the public link immediately and break any old /organizations/ links.
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-zinc-600">About / Description</span>
            <textarea
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={4}
              placeholder="Empowering communities, organizing fundraisers..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
            />
          </label>
        </section>

        {/* 2. Contact & Links */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-black text-zinc-950">Contact & Links</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Contact Email *</span>
              <input
                type="email"
                required
                value={form.contact_email}
                onChange={(e) => update("contact_email", e.target.value)}
                placeholder="info@myorganization.org"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Website URL</span>
              <input
                type="text"
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="www.myorganization.org"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
          </div>
        </section>

        {/* 3. Media (Logo & Banner) */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-black text-zinc-950">Media</h2>
          <div className="grid gap-6 md:grid-cols-2">

            {/* Logo upload */}
            <div className="space-y-3">
              <span className="block text-xs font-bold text-zinc-600">Organization Logo (Square)</span>
              <ImageUploadWithCrop
                value={photoPreview || form.photo}
                aspectRatio={1}
                previewClassName="h-20 w-20 rounded-xl"
                label="Choose Photo"
                onCropped={handleCroppedPhoto}
              />
            </div>

            {/* Banner upload */}
            <div className="space-y-3">
              <span className="block text-xs font-bold text-zinc-600">Banner Image (Min 1200x300px)</span>
              <ImageUploadWithCrop
                value={bannerPreview || form.banner}
                aspectRatio={ORGANIZER_BANNER_ASPECT}
                previewClassName="h-20 w-36 rounded-xl"
                label="Choose Banner"
                minWidth={MIN_BANNER_WIDTH}
                minHeight={MIN_BANNER_HEIGHT}
                onCropped={handleCroppedBanner}
              />
            </div>

          </div>
        </section>

        {/* 4. Social Links */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-black text-zinc-950">Social Accounts</h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Facebook URL</span>
              <input
                type="text"
                value={form.facebook}
                onChange={(e) => update("facebook", e.target.value)}
                placeholder="facebook.com/..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Twitter/X URL</span>
              <input
                type="text"
                value={form.twitter}
                onChange={(e) => update("twitter", e.target.value)}
                placeholder="twitter.com/..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">Instagram URL</span>
              <input
                type="text"
                value={form.instagram}
                onChange={(e) => update("instagram", e.target.value)}
                placeholder="instagram.com/..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">LinkedIn URL</span>
              <input
                type="text"
                value={form.linkedin}
                onChange={(e) => update("linkedin", e.target.value)}
                placeholder="linkedin.com/company/..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">YouTube Channel URL</span>
              <input
                type="text"
                value={form.youtube}
                onChange={(e) => update("youtube", e.target.value)}
                placeholder="youtube.com/c/..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-zinc-600">TikTok URL</span>
              <input
                type="text"
                value={form.tiktok}
                onChange={(e) => update("tiktok", e.target.value)}
                placeholder="tiktok.com/@..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white"
              />
            </label>
          </div>
        </section>

        {/* 5. Visibility */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-zinc-950">Visibility</h2>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            Control the discoverability of your organization's profile.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              {
                val: "public",
                title: "Public Profile",
                desc: "Everyone can search, view, and follow this organization.",
              },
              {
                val: "private",
                title: "Private Profile",
                desc: "Only members can access and view details.",
              },
            ].map((v) => (
              <label
                key={v.val}
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
                  form.visibility === v.val
                    ? "border-orange-500 bg-orange-50/20"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={form.visibility === v.val}
                  onChange={() => update("visibility", v.val as "public" | "private")}
                  className="mt-1 accent-orange-600"
                />
                <div>
                  <span className="block text-sm font-black text-zinc-900">{v.title}</span>
                  <span className="mt-0.5 block text-xs font-medium text-zinc-500">{v.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 py-4 text-base font-black text-white hover:bg-orange-700 disabled:bg-orange-300 transition"
        >
          {saving && <Loader2 className="h-5 w-5 animate-spin" />}
          {saving ? "Saving Changes..." : "Save Settings"}
        </button>

      </form>
    </div>
  );
}
