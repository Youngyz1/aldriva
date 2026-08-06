"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  CreatorField,
  CreatorPanel,
  CreatorWorkspace,
  greenInputClass,
} from "@/components/CreatorWorkspace";
import { supabase } from "@/lib/supabase";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";
import RichTextEditor from "@/components/editor/RichTextEditor";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import { CAMPAIGN_CATEGORIES } from "@/lib/categories";

const FUNDRAISER_MEDIA_ASPECT = 16 / 9;

const FUNDRAISER_STEPS = [
  { label: "Fundraiser Details" },
  { label: "Goal & Story" },
  { label: "Settings" },
  { label: "Review & Publish" },
];

type OrganizerProfile = {
  id: string;
  name: string;
  photo?: string | null;
};

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

function generateSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function money(value: string | number) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function CreateFundraiserPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<SelectedPhoto[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [organizers, setOrganizers] = useState<OrganizerProfile[]>([]);
  const photoFilesRef = useRef<SelectedPhoto[]>([]);

  const [form, setForm] = useState({
    title: "",
    short_description: "",
    story: "",
    goal: "",
    raised: "",
    organizer_id: "",
    organizer: "",
    banner: "",
    category: "",
    tags: "",
  });

  useEffect(() => {
    photoFilesRef.current = photoFiles;
  }, [photoFiles]);

  useEffect(() => {
    return () => {
      photoFilesRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      setEmail(data.session.user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (profile?.status === "suspended") {
        router.push("/login?suspended=1");
        return;
      }
      const { data: organizerProfiles, error: organizerError } = await supabase
        .from("organizers")
        .select("id, name, photo")
        .eq("user_id", data.session.user.id)
        .order("created_at", { ascending: true });

      if (organizerError) {
        setError(organizerError.message);
      }

      const profiles = organizerProfiles ?? [];
      const requestedOrganizerId = new URLSearchParams(window.location.search).get("organizer");
      const selectedOrganizer =
        profiles.find((organizer) => organizer.id === requestedOrganizerId) ??
        profiles[0];
      setOrganizers(profiles);
      setForm((current) => ({
        ...current,
        organizer_id: current.organizer_id || selectedOrganizer?.id || "",
        organizer: current.organizer || selectedOrganizer?.name || "",
      }));
      setChecking(false);
    });
  }, [router]);

  const progress = useMemo(() => {
    const goal = Number(form.goal || 0);
    const raised = Number(form.raised || 0);
    return goal ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  }, [form.goal, form.raised]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setNotice("");
    if (event.target.name === "organizer_id") {
      const selectedOrganizer = organizers.find((organizer) => organizer.id === event.target.value);
      setForm({
        ...form,
        organizer_id: event.target.value,
        organizer: selectedOrganizer?.name || "",
      });
      return;
    }
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function handleCroppedPhoto(file: File, previewUrl: string) {
    setNotice("");
    setPhotoFiles((current) =>
      current.length >= 8
        ? current
        : [...current, { id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`, file, previewUrl }]
    );
  }

  function removePhoto(id: string) {
    setNotice("");
    setPhotoFiles((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((photo) => photo.id !== id);
    });
  }

  function saveDraft() {
    localStorage.setItem("fundraiser-draft", JSON.stringify({ form, visibility }));
    setNotice("Draft saved on this device.");
  }

  function nextStep() {
    setCurrentStep((step) => Math.min(step + 1, FUNDRAISER_STEPS.length - 1));
  }

  function previousStep() {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const slug = generateSlug(form.title);
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

    if (!form.organizer_id) {
      setError("Choose an organizer profile before launching this fundraiser.");
      setLoading(false);
      return;
    }

    const selectedOrganizer = organizers.find((organizer) => organizer.id === form.organizer_id);
    if (!selectedOrganizer) {
      setError("Choose an organizer profile that belongs to your account.");
      setLoading(false);
      return;
    }

    if (!form.category) {
      setError("Please select a campaign category.");
      setLoading(false);
      return;
    }

    let video_url = null;
    if (videoFile) {
      setUploadProgress("Uploading video...");
      const ext = videoFile.name.split(".").pop();
      const fileName = `${slug}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("videos").upload(fileName, videoFile);

      if (uploadError) {
        setError("Video upload failed: " + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);
      video_url = urlData.publicUrl;
      setUploadProgress("");
    }

    const story = [form.short_description, form.story].filter(Boolean).join("\n\n");
    const { data: insertedFundraiser, error: insertError } = await supabase
      .from("fundraisers")
      .insert({
        title: form.title,
        slug,
        story,
        goal: Number(form.goal),
        raised: Number(form.raised) || 0,
        organizer: form.organizer,
        organizer_id: form.organizer_id,
        category: form.category,
        video_url,
        user_id: session.user.id,
      })
      .select("id, slug")
      .single();

    if (insertError || !insertedFundraiser) {
      setError(insertError?.message || "Could not create fundraiser.");
      setLoading(false);
      return;
    }

    const uploadedMedia: { url: string; position: number }[] = [];

    for (const [index, photo] of photoFiles.entries()) {
      setUploadProgress(`Uploading photo ${index + 1} of ${photoFiles.length}...`);
      try {
        const url = await uploadImage(photo.file, "fundraiser-media", insertedFundraiser.id);
        uploadedMedia.push({ url, position: index });
      } catch (err) {
        const message = err instanceof UploadImageError ? err.message : "Photo upload failed.";
        setError("Photo upload failed: " + message);
        setLoading(false);
        return;
      }
    }

    if (uploadedMedia.length > 0) {
      const { error: mediaError } = await supabase.from("fundraiser_media").insert(
        uploadedMedia.map((item) => ({
          fundraiser_id: insertedFundraiser.id,
          url: item.url,
          type: "image",
          position: item.position,
        }))
      );

      if (mediaError) {
        setError("Fundraiser media insert failed: " + mediaError.message);
        setLoading(false);
        return;
      }

      const firstImageUrl = uploadedMedia[0].url;
      const { error: coverError } = await supabase
        .from("fundraisers")
        .update({ image_url: firstImageUrl, banner: firstImageUrl })
        .eq("id", insertedFundraiser.id);

      if (coverError) {
        setError("Cover image update failed: " + coverError.message);
        setLoading(false);
        return;
      }
    }

    localStorage.removeItem("fundraiser-draft");
    router.push(`/fundraisers/${slug}`);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-lg font-semibold text-zinc-400">Checking access...</p>
      </main>
    );
  }

  const tips = [
    "Choose a compelling campaign title.",
    "Set a realistic goal.",
    "Tell your story with clear impact.",
    "Add a powerful cover image.",
  ];

  const aside = (
    <>
      <CreatorPanel title="Fundraiser Tips">
        <div className="space-y-4">
          {tips.map((tip) => (
            <p key={tip} className="flex gap-3 text-sm font-semibold text-zinc-600">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
              {tip}
            </p>
          ))}
        </div>
      </CreatorPanel>

      <CreatorPanel title="Preview">
        <div className="overflow-hidden rounded-xl bg-zinc-100">
          {photoFiles[0] ? (
            <div
              className="h-32 bg-cover bg-center"
              style={{ backgroundImage: `url(${photoFiles[0].previewUrl})` }}
            />
          ) : (
            <div className="flex h-32 items-center justify-center text-zinc-400">
              <i className="ti ti-photo text-4xl" aria-hidden="true" />
            </div>
          )}
        </div>
        <h3 className="mt-4 text-xl font-black">{form.title || "Fundraiser Title"}</h3>
        <p className="mt-1 text-sm font-medium text-zinc-500">by {form.organizer || "Organization Name"}</p>
        <div className="mt-4">
          <p className="text-sm font-black">{money(form.raised)} raised of {money(form.goal)} goal</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs font-bold text-zinc-500">{progress}% funded</p>
        </div>
      </CreatorPanel>

      <CreatorPanel title="Visibility">
        <fieldset className="space-y-4">
          {[
            ["public", "Public", "Anyone can discover and view"],
            ["private", "Private", "Only people with a link can view"],
          ].map(([value, label, detail]) => (
            <label key={value} className="flex cursor-pointer gap-3">
              <input
                checked={visibility === value}
                className="mt-1 accent-emerald-600"
                name="visibility"
                onChange={() => setVisibility(value)}
                type="radio"
              />
              <span>
                <span className="block text-sm font-black">{label}</span>
                <span className="text-xs font-medium text-zinc-500">{detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </CreatorPanel>
    </>
  );

  const footer = (
    <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
      <Link href="/dashboard" className="rounded-xl border border-zinc-200 px-4 py-2.5 text-center text-sm font-black text-zinc-700 hover:bg-zinc-50">
        Cancel
      </Link>
      <div className="flex gap-3">
        {currentStep > 0 && (
          <button onClick={previousStep} type="button" className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-black text-zinc-700 hover:bg-zinc-50">
            Back
          </button>
        )}
        {currentStep < FUNDRAISER_STEPS.length - 1 ? (
          <button onClick={nextStep} type="button" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700">
            Next: {FUNDRAISER_STEPS[currentStep + 1].label}
          </button>
        ) : (
          <button disabled={loading} form="create-fundraiser-form" type="submit" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-emerald-300">
            {loading ? uploadProgress || "Launching..." : "Launch Fundraiser"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <CreatorWorkspace
      active="Fundraisers"
      accent="green"
      title="Create Fundraiser"
      description="Set up your fundraiser and start making an impact."
      email={email}
      steps={FUNDRAISER_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onSaveDraft={saveDraft}
      aside={aside}
      footer={footer}
    >
      <form id="create-fundraiser-form" onSubmit={handleSubmit} className="space-y-5">
        {(error || notice) && (
          <div className={`rounded-2xl border px-5 py-4 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || notice}
          </div>
        )}

        {currentStep === 0 && (
          <>
            <CreatorPanel title="Basic Information">
              <div className="grid gap-5">
                <CreatorField label="Fundraiser Title">
                  <input name="title" value={form.title} onChange={handleChange} required type="text" placeholder="Support Education for Underprivileged Children" className={greenInputClass} />
                </CreatorField>

                <CreatorField label="Organization Profile">
                  <select name="organizer_id" value={form.organizer_id} onChange={handleChange} required disabled={organizers.length === 0} className={greenInputClass}>
                    {organizers.length === 0
                      ? <option value="">No organizer profiles yet</option>
                      : organizers.map((organizer) => <option key={organizer.id} value={organizer.id}>{organizer.name}</option>)}
                  </select>
                  {organizers.length === 0 && (
                    <Link href="/create-organizer" className="mt-2 inline-block text-sm font-black text-emerald-700 hover:text-emerald-800">
                      Create an organizer profile
                    </Link>
                  )}
                </CreatorField>

                <CreatorField label="Short Description" hint={`${form.short_description.length}/160`}>
                  <textarea name="short_description" value={form.short_description} onChange={handleChange} maxLength={160} rows={4} placeholder="A short summary of your fundraiser..." className={greenInputClass} />
                </CreatorField>
              </div>
            </CreatorPanel>

            <CreatorPanel title="Fundraiser Photos">
              <div className="grid gap-5">
                <CreatorField label={`Add photos (${photoFiles.length}/8)`} hint="The first image becomes the fundraiser cover. Each photo is cropped to a wide 16:9 banner shape.">
                  <ImageUploadWithCrop
                    aspectRatio={FUNDRAISER_MEDIA_ASPECT}
                    previewClassName="hidden"
                    label={photoFiles.length >= 8 ? "Maximum 8 photos reached" : "Add photo"}
                    disabled={photoFiles.length >= 8}
                    onCropped={handleCroppedPhoto}
                  />
                </CreatorField>

                {photoFiles.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {photoFiles.map((photo, index) => (
                      <div key={photo.id} className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                        <img
                          src={photo.previewUrl}
                          alt={`Fundraiser photo ${index + 1}`}
                          className="aspect-video w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm font-black text-white transition hover:bg-black"
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          ×
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-black uppercase text-white">
                            Cover
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <CreatorField label="Campaign Video" hint="Optional. MP4, MOV, or AVI uploads are supported by your storage bucket.">
                  <input type="file" accept="video/*" onChange={(event) => setVideoFile(event.target.files?.[0] || null)} className="w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm font-semibold" />
                </CreatorField>
              </div>
            </CreatorPanel>
          </>
        )}

        {currentStep === 1 && (
          <CreatorPanel title="Goal & Story">
            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <CreatorField label="Fundraising Goal">
                  <input name="goal" value={form.goal} onChange={handleChange} required type="number" min="1" placeholder="20000" className={greenInputClass} />
                </CreatorField>
                <CreatorField label="Funds Raised So Far">
                  <input name="raised" value={form.raised} onChange={handleChange} type="number" min="0" placeholder="0" className={greenInputClass} />
                </CreatorField>
              </div>
              <CreatorField label="Campaign Story">
                <RichTextEditor
                  value={form.story}
                  onChange={(val) => setForm((c) => ({ ...c, story: val }))}
                  placeholder="Tell people why this cause matters, who it helps, and how funds will be used..."
                  accent="green"
                />
              </CreatorField>
            </div>
          </CreatorPanel>
        )}

        {currentStep === 2 && (
          <CreatorPanel title="Settings">
            <div className="grid gap-5">
              <CreatorField label="Campaign Category *">
                <SearchableSelect
                  options={CAMPAIGN_CATEGORIES}
                  value={form.category}
                  onChange={(val) => setForm((c) => ({ ...c, category: val }))}
                  placeholder="Select a category..."
                  accent="green"
                  error={!form.category ? "Category is required" : undefined}
                />
                {!form.category && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600">Please select a category to continue.</p>
                )}
              </CreatorField>
              <CreatorField label="Tags" hint="Use commas to separate tags for internal organization.">
                <input name="tags" value={form.tags} onChange={handleChange} type="text" placeholder="school, community, scholarship" className={greenInputClass} />
              </CreatorField>
            </div>
          </CreatorPanel>
        )}

        {currentStep === 3 && (
          <CreatorPanel title="Review & Publish">
            <div className="grid gap-4">
              {[
                ["Fundraiser", form.title || "Not set"],
                ["Organization", form.organizer || "Not set"],
                ["Category", form.category],
                ["Goal", money(form.goal)],
                ["Raised", money(form.raised)],
                ["Photos", String(photoFiles.length)],
                ["Visibility", visibility],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col justify-between gap-1 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200 sm:flex-row">
                  <p className="text-sm font-black text-zinc-500">{label}</p>
                  <p className="text-sm font-bold text-zinc-950">{value}</p>
                </div>
              ))}
            </div>
          </CreatorPanel>
        )}
      </form>
    </CreatorWorkspace>
  );
}
