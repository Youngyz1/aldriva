"use client";

/**
 * app/create-organizer/page.tsx
 * Creates a new organization profile owned by the current user.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getImageDimensions, MIN_BANNER_WIDTH, MIN_BANNER_HEIGHT } from "@/lib/image-dimensions";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";

type FormState = {
  name:     string;
  bio:      string;
  facebook: string;
  twitter:  string;
  website:  string;
  visibility: "public" | "private";
  slug:     string;
  org_type: string;
  contact_email: string;
  instagram: string;
  linkedin: string;
  youtube: string;
  tiktok: string;
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

export default function CreateOrganizerPage() {
  const router = useRouter();

  const [checking,      setChecking]      = useState(true);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [photoFile,     setPhotoFile]     = useState<File | null>(null);
  const [photoPreview,  setPhotoPreview]  = useState<string | null>(null);
  const [bannerFile,    setBannerFile]    = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name:     "",
    bio:      "",
    facebook: "",
    twitter:  "",
    website:  "",
    visibility: "public",
    slug:     "",
    org_type: "nonprofit", // Default required type
    contact_email: "",
    instagram: "",
    linkedin: "",
    youtube: "",
    tiktok: "",
  });

  // On mount: require an authenticated user.
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.status === "suspended") {
        router.push("/login?suspended=1");
        return;
      }
      setChecking(false);
    }
    load();
  }, [router]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      // Auto-generate slug from name if the slug hasn't been edited manually yet,
      // or if they are in sync
      if (name === "name") {
        const generatedSlug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        updated.slug = generatedSlug;
      }
      return updated;
    });
  }

  function setVisibility(visibility: FormState["visibility"]) {
    setForm((prev) => ({ ...prev, visibility }));
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setBannerFile(null);
      return;
    }

    try {
      const { width, height } = await getImageDimensions(file);
      if (width < MIN_BANNER_WIDTH || height < MIN_BANNER_HEIGHT) {
        setError(
          `Banner image is too small (${width}x${height}px). Use at least ${MIN_BANNER_WIDTH}x${MIN_BANNER_HEIGHT}px so it doesn't blur when stretched across the banner.`
        );
        e.target.value = "";
        return;
      }
    } catch {
      // Couldn't read dimensions — let it through rather than block upload.
    }

    setError("");
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  }

  async function uploadFile(file: File, bucket: string, prefix: string) {
    try {
      return await uploadImage(file, bucket, prefix);
    } catch (err) {
      throw new Error(err instanceof UploadImageError ? err.message : "Upload failed.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", session.user.id)
      .maybeSingle();
    if (profile?.status === "suspended") {
      router.push("/login?suspended=1");
      return;
    }

    // Auto-generate/clean slug
    let baseSlug = form.slug.trim() || form.name.trim();
    baseSlug = baseSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!baseSlug) baseSlug = "organization";

    // Auto-resolve collisions
    let resolvedSlug = baseSlug;
    let counter = 2;
    let isUnique = false;

    try {
      while (!isUnique) {
        const { data: existing } = await supabase
          .from("organizers")
          .select("id")
          .eq("slug", resolvedSlug)
          .maybeSingle();

        if (!existing) {
          isUnique = true;
        } else {
          resolvedSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      let photo:  string | null = null;
      let banner: string | null = null;

      if (photoFile)  photo  = await uploadFile(photoFile,  "organizer-images",  "photo");
      if (bannerFile) banner = await uploadFile(bannerFile, "organizer-banners", "banner");

      const payload = {
        name:     form.name,
        slug:     resolvedSlug,
        org_type: form.org_type,
        contact_email: form.contact_email,
        bio:      form.bio,
        facebook: form.facebook,
        twitter:  form.twitter,
        website:  form.website,
        instagram: form.instagram,
        linkedin: form.linkedin,
        youtube:  form.youtube,
        tiktok:   form.tiktok,
        visibility: form.visibility,
        photo,
        banner,
        user_id:  session.user.id,
      };

      const { data: newOrg, error: insertErr } = await supabase
        .from("organizers")
        .insert(payload)
        .select()
        .single();

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      router.push(`/dashboard/org/${newOrg.id}/overview`);
    } catch (err: any) {
      setError(err?.message || "An error occurred.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <section className="mx-auto max-w-4xl px-6 py-20">

        {/* Header */}
        <div className="mb-12">
          <p className="mb-3 font-semibold text-orange-500">
            Organization Setup
          </p>
          <h1 className="text-3xl font-black sm:text-4xl lg:text-5xl">
            Create Organization Profile
          </h1>
          <p className="mt-4 text-lg text-zinc-600">
            Set up the profile page and management workspace for your nonprofit, business, church, school, or community group.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-600 font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* BANNER */}
          <div>
            <label className="mb-3 block font-semibold text-sm text-zinc-700">Banner Image (Min 1200x300px)</label>
            <div
              className="relative flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-zinc-200 hover:opacity-90 transition"
              style={
                bannerPreview
                  ? { backgroundImage: `url(${bannerPreview})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : {}
              }
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleBanner}
                className="hidden"
                id="banner-upload"
              />
              <label
                htmlFor="banner-upload"
                className="absolute inset-0 flex cursor-pointer items-center justify-center"
              >
                {!bannerPreview && (
                  <div className="text-center">
                    <p className="mb-2 text-4xl">🖼️</p>
                    <p className="font-semibold text-zinc-500">Click to upload banner</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* PHOTO */}
          <div>
            <label className="mb-3 block font-semibold text-sm text-zinc-700">Profile Logo / Photo</label>
            <div className="flex items-center gap-8">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-zinc-200 shadow">
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl text-zinc-400">🏢</span>
                )}
              </div>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhoto}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer rounded-xl bg-zinc-100 px-5 py-3 font-semibold transition hover:bg-zinc-200"
                >
                  Upload Logo
                </label>
                <p className="mt-2 text-sm text-zinc-400">JPG, PNG recommended</p>
              </div>
            </div>
          </div>

          {/* NAME & TYPE */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-3 block font-semibold text-sm text-zinc-700">Organization Name *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                type="text"
                placeholder="Greenwood Alliance"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
            </div>

            <div>
              <label className="mb-3 block font-semibold text-sm text-zinc-700">Organization Type *</label>
              <select
                name="org_type"
                value={form.org_type}
                onChange={handleChange}
                required
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              >
                {ORG_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SLUG */}
          <div>
            <label className="mb-3 block font-semibold text-sm text-zinc-700">URL Handle / Slug *</label>
            <div className="flex rounded-2xl border border-zinc-300 overflow-hidden bg-white focus-within:border-orange-500">
              <span className="flex items-center bg-zinc-100 px-4 text-sm font-semibold text-zinc-500 border-r border-zinc-200 select-none">
                /org/
              </span>
              <input
                name="slug"
                value={form.slug}
                onChange={handleChange}
                required
                type="text"
                placeholder="greenwood-alliance"
                className="w-full px-5 py-4 outline-none bg-transparent"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">Lowercase letters, numbers, and dashes. Auto-generated from name.</p>
          </div>

          {/* EMAIL */}
          <div>
            <label className="mb-3 block font-semibold text-sm text-zinc-700">Contact Email *</label>
            <input
              name="contact_email"
              value={form.contact_email}
              onChange={handleChange}
              required
              type="email"
              placeholder="contact@greenwoodalliance.org"
              className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
            />
            <p className="mt-2 text-xs text-zinc-400">Exposed publicly so users and donors can contact you.</p>
          </div>

          {/* BIO */}
          <div>
            <label className="mb-3 block font-semibold text-sm text-zinc-700">Bio / About</label>
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={4}
              placeholder="Tell people about your organization's mission and cause..."
              className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
            />
          </div>

          {/* VISIBILITY */}
          <fieldset className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <legend className="text-lg font-black text-zinc-950">Profile Visibility</legend>
            <p className="mt-1 text-sm font-semibold text-zinc-500">
              Choose whether this profile should be public or private.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["public", "Public", "People can browse this organization and follow updates."],
                ["private", "Private", "Only you can view and edit this organization profile."],
              ].map(([value, label, detail]) => (
                <label key={value} className="flex cursor-pointer gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <input
                    type="radio"
                    name="visibility"
                    checked={form.visibility === value}
                    onChange={() => setVisibility(value as FormState["visibility"])}
                    className="mt-1 accent-orange-600"
                  />
                  <span>
                    <span className="block text-sm font-black text-zinc-950">{label}</span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* SOCIAL & WEBSITE */}
          <div className="space-y-4">
            <label className="block font-semibold text-sm text-zinc-700">Website & Social Media Links</label>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                name="website"
                value={form.website}
                onChange={handleChange}
                type="text"
                placeholder="Website URL (e.g. greenwoodalliance.org)"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
              <input
                name="facebook"
                value={form.facebook}
                onChange={handleChange}
                type="text"
                placeholder="Facebook URL"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
              <input
                name="twitter"
                value={form.twitter}
                onChange={handleChange}
                type="text"
                placeholder="Twitter/X URL"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
              <input
                name="instagram"
                value={form.instagram}
                onChange={handleChange}
                type="text"
                placeholder="Instagram URL"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
              <input
                name="linkedin"
                value={form.linkedin}
                onChange={handleChange}
                type="text"
                placeholder="LinkedIn URL"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
              <input
                name="youtube"
                value={form.youtube}
                onChange={handleChange}
                type="text"
                placeholder="YouTube Channel URL"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
              <input
                name="tiktok"
                value={form.tiktok}
                onChange={handleChange}
                type="text"
                placeholder="TikTok URL"
                className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500 bg-white"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-orange-500 py-5 text-lg font-bold text-white transition hover:bg-orange-600 disabled:bg-orange-300"
            >
              {loading
                ? "Creating…"
                : "Create Organization Profile"}
            </button>
          </div>

        </form>
      </section>
    </main>
  );
}
