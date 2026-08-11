"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/editor/RichTextEditor";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import BeneficiarySelector, {
  EMPTY_BENEFICIARY_DRAFT,
  type BeneficiaryDraft,
} from "@/components/fundraisers/BeneficiarySelector";
import BeneficiaryInvite from "@/components/fundraisers/BeneficiaryInvite";
import { validateBeneficiary, resolveBeneficiary } from "@/lib/beneficiary";
import { CAMPAIGN_CATEGORIES } from "@/lib/categories";

// Matches the detail-page hero (FundraiserMediaSlider)'s mobile ratio — the
// single ratio every uploaded photo is cropped to.
const FUNDRAISER_PHOTO_ASPECT_RATIO = 4 / 5;


function generateSlug(title: string) {
  return title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

type GalleryItem = {
  url: string;
  caption: string;
};

type OrganizerProfile = {
  id: string;
  name: string;
};

const inputClass =
  "w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-green-500";

export default function EditFundraiserPage() {
  const params = useParams();
  const router = useRouter();
  const fundraiserId = params?.id as string;
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [organizers, setOrganizers] = useState<OrganizerProfile[]>([]);
  const [form, setForm] = useState({
    title: "",
    organizer_id: "",
    organizer: "",
    goal: "",
    raised: "",
    banner: "",
    video_url: "",
    story: "",
    category: "",
  });
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([
    { url: "", caption: "" },
    { url: "", caption: "" },
    { url: "", caption: "" },
  ]);
  const [beneficiary, setBeneficiary] = useState<BeneficiaryDraft>(EMPTY_BENEFICIARY_DRAFT);
  // Fallback for the "self" beneficiary type and the stored organizer
  // display text — both normally derive from the selected organizer,
  // which won't exist for a personal fundraiser.
  const [userDisplayName, setUserDisplayName] = useState("");
  // The saved beneficiary record (migration_51), which the invite attaches to.
  const [beneficiaryRecord, setBeneficiaryRecord] = useState<{
    id: string;
    name: string;
    claimed: boolean;
    claimEmail: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("status, account_info")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.status === "suspended") {
        router.push("/login?suspended=1");
        return;
      }

      const accountInfo = (profile?.account_info ?? {}) as { firstName?: string; lastName?: string };
      const fullName = [accountInfo.firstName, accountInfo.lastName].filter(Boolean).join(" ").trim();
      const displayName = fullName || (session.user.email?.split("@")[0] ?? "");
      setUserDisplayName(displayName);

      const { data: organizerProfiles, error: organizerError } = await supabase
        .from("organizers")
        .select("id, name")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (organizerError) {
        setError(organizerError.message);
        setChecking(false);
        return;
      }

      const ownedOrganizers = organizerProfiles ?? [];
      setOrganizers(ownedOrganizers);
      const ownedOrganizerIds = ownedOrganizers.map((organizer) => organizer.id);

      const { data: fundraiser, error: fundraiserError } = await supabase
        .from("fundraisers")
        .select("*")
        .eq("id", fundraiserId)
        .single();

      if (
        fundraiserError ||
        !fundraiser ||
        (
          fundraiser.user_id !== session.user.id &&
          !ownedOrganizerIds.includes(fundraiser.organizer_id)
        )
      ) {
        setError("Fundraiser not found or you do not have access.");
        setChecking(false);
        return;
      }

      // A NULL organizer_id means this fundraiser is genuinely personal —
      // never fall back to ownedOrganizers[0] in that case, or a user who
      // also happens to own an unrelated organizer would have it silently
      // pre-selected here (and silently attached on save, since nothing
      // else would reset organizer_id back to null). The fallback to the
      // first owned organizer is preserved only for the non-null case
      // (e.g. the stored organizer_id no longer matches any owned
      // organizer) — existing behavior, unchanged.
      const selectedOrganizer = fundraiser.organizer_id
        ? ownedOrganizers.find((organizer) => organizer.id === fundraiser.organizer_id) ?? ownedOrganizers[0]
        : undefined;

      setSlug(fundraiser.slug || "");
      setForm({
        title: fundraiser.title || "",
        organizer_id: selectedOrganizer?.id || "",
        organizer: selectedOrganizer?.name || fundraiser.organizer || "",
        goal: fundraiser.goal?.toString() || "",
        raised: fundraiser.raised?.toString() || "",
        banner: fundraiser.banner || "",
        video_url: fundraiser.video_url || "",
        story: fundraiser.story || "",
        category: fundraiser.category || "",
      });

      // Tolerates rows saved before the beneficiary column existed — those
      // resolve to a self-beneficiary named after the organizer, matching the
      // migration's backfill, so editing them doesn't wipe anything.
      const existingBeneficiary = resolveBeneficiary(
        (fundraiser as { beneficiary?: unknown }).beneficiary,
        selectedOrganizer?.name || fundraiser.organizer || displayName
      );
      // Beneficiary record lookup is best-effort: it only drives the optional
      // invite box, so a failure here must not block editing the campaign.
      if (fundraiser.beneficiary_id) {
        const { data: record } = await supabase
          .from("beneficiaries")
          .select("id, name, user_id, claimed_at, claim_email")
          .eq("id", fundraiser.beneficiary_id)
          .maybeSingle();
        if (record) {
          setBeneficiaryRecord({
            id: record.id,
            name: record.name,
            claimed: Boolean(record.user_id || record.claimed_at),
            claimEmail: record.claim_email,
          });
        }
      }

      if (existingBeneficiary) {
        setBeneficiary({
          type: existingBeneficiary.type,
          name: existingBeneficiary.name,
          relationship: existingBeneficiary.relationship ?? "",
          description: existingBeneficiary.description ?? "",
          website: existingBeneficiary.website ?? "",
          registrationNumber: existingBeneficiary.registrationNumber ?? "",
          species: existingBeneficiary.species ?? "",
          photo: existingBeneficiary.photo ?? "",
        });
      }

      const { data: media } = await supabase
        .from("fundraiser_media")
        .select("url, caption, position")
        .eq("fundraiser_id", fundraiserId)
        .order("position", { ascending: true });

      const loadedMedia =
        media && media.length > 0
          ? media.map((item) => ({
              url: item.url || "",
              caption: item.caption || "",
            }))
          : [
              { url: fundraiser.banner || "", caption: fundraiser.title || "" },
              { url: "", caption: "" },
              { url: "", caption: "" },
            ];

      setGalleryItems(loadedMedia);
      setChecking(false);
    }

    if (fundraiserId) load();
  }, [fundraiserId, router]);

  function update(field: string, value: string) {
    if (field === "organizer_id") {
      const selectedOrganizer = organizers.find((organizer) => organizer.id === value);
      setForm((current) => ({
        ...current,
        organizer_id: value,
        // Cleared (not kept stale) when switching to "Personal fundraiser"
        // — the submit-time fallback (form.organizer || userDisplayName)
        // then correctly shows the user's own name instead of whichever
        // organizer was previously selected.
        organizer: selectedOrganizer?.name || "",
      }));
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateGalleryItem(index: number, field: keyof GalleryItem, value: string) {
    setGalleryItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addGalleryItem() {
    setGalleryItems((items) => [...items, { url: "", caption: "" }]);
  }

  function removeGalleryItem(index: number) {
    setGalleryItems((items) =>
      items.length > 1 ? items.filter((_, itemIndex) => itemIndex !== index) : items
    );
  }

  function cleanGalleryItems() {
    return galleryItems.filter((item) => item.url.trim() !== "");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const nextSlug = generateSlug(form.title);
      // organizer_id is optional — "Personal fundraiser" (empty) is a
      // valid, intentional choice, not just a fallback for users with
      // none. Only validate that a non-empty selection actually belongs
      // to this account.
      const selectedOrganizer = form.organizer_id
        ? organizers.find((organizer) => organizer.id === form.organizer_id)
        : undefined;
      if (form.organizer_id && !selectedOrganizer) {
        throw new Error("Choose an organizer profile that belongs to your account.");
      }

      const beneficiaryResult = validateBeneficiary({
        ...beneficiary,
        name: beneficiary.type === "self" ? (selectedOrganizer?.name || userDisplayName) : beneficiary.name,
      });
      if (!beneficiaryResult.ok) {
        throw new Error(beneficiaryResult.error);
      }

      // Same find-or-create as the create flow, so editing an older campaign
      // (or changing who it helps) also produces an invitable profile.
      const beneficiaryRes = await fetch("/api/beneficiary/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiary: beneficiaryResult.value }),
      });
      const beneficiaryData = await beneficiaryRes.json();
      if (!beneficiaryRes.ok) {
        throw new Error(beneficiaryData.error || "Could not save the beneficiary.");
      }

      const { error: updateError } = await supabase
        .from("fundraisers")
        .update({
          title: form.title,
          slug: nextSlug,
          organizer: selectedOrganizer?.name || userDisplayName,
          organizer_id: form.organizer_id || null,
          beneficiary: beneficiaryResult.value,
          beneficiary_id: beneficiaryData.beneficiaryId,
          goal: Number(form.goal),
          raised: Number(form.raised) || 0,
          banner: form.banner,
          video_url: form.video_url || null,
          story: form.story,
          category: form.category || "Other",
        })
        .eq("id", fundraiserId);

      if (updateError) throw new Error(updateError.message);

      const mediaItems = cleanGalleryItems();
      const { error: deleteMediaError } = await supabase
        .from("fundraiser_media")
        .delete()
        .eq("fundraiser_id", fundraiserId);

      if (deleteMediaError) throw new Error(deleteMediaError.message);

      if (mediaItems.length > 0) {
        const { error: mediaError } = await supabase.from("fundraiser_media").insert(
        mediaItems.map((item, index) => ({
            fundraiser_id: fundraiserId,
            url: (item.url ?? "").trim(),
            caption: item.caption.trim() || form.title,
            position: index,
            type: "image",
          }))
        );

        if (mediaError) throw new Error(mediaError.message);
      }

      router.push(`/fundraisers/${nextSlug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update fundraiser.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-50"><p className="text-lg font-semibold text-zinc-500">Loading fundraiser...</p></main>;
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto max-w-4xl px-6 py-14">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-green-600">Fundraiser</p>
            <h1 className="mt-2 text-5xl font-black">Edit Fundraiser</h1>
            <p className="mt-3 text-zinc-600">Strengthen imported campaigns with better story, images, progress, and organizer details.</p>
          </div>
          {slug && <Link href={`/fundraisers/${slug}`} className="font-black text-green-600 hover:text-green-700">View fundraiser</Link>}
        </div>

        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-7 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <input value={form.title} onChange={(event) => update("title", event.target.value)} required placeholder="Fundraiser title" className={inputClass} />
          {/* Optional organizational affiliation — only shown when the
              user actually has an organizer to attach. "Personal
              fundraiser" is always selectable even when organizers
              exist, since affiliation is opt-in, not the default. */}
          {organizers.length > 0 && (
            <select value={form.organizer_id} onChange={(event) => update("organizer_id", event.target.value)} className={inputClass}>
              <option value="">Personal fundraiser (no organizer)</option>
              {organizers.map((organizer) => (
                <option key={organizer.id} value={organizer.id}>
                  {organizer.name}
                </option>
              ))}
            </select>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            <input value={form.goal} onChange={(event) => update("goal", event.target.value)} required type="number" min="1" placeholder="Goal" className={inputClass} />
            <input value={form.raised} onChange={(event) => update("raised", event.target.value)} type="number" min="0" placeholder="Raised so far" className={inputClass} />
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="mb-1 text-lg font-black text-zinc-950">Who are you fundraising for?</h2>
            <p className="mb-4 text-sm font-semibold text-zinc-500">
              The organizer runs this fundraiser — the beneficiary is who it helps.
            </p>
            <BeneficiarySelector
              value={beneficiary}
              onChange={setBeneficiary}
              organizerName={form.organizer || userDisplayName}
              inputClassName={inputClass}
              onError={setError}
            />

            {beneficiaryRecord && (
              <div className="mt-4">
                <BeneficiaryInvite
                  beneficiaryId={beneficiaryRecord.id}
                  beneficiaryName={beneficiaryRecord.name}
                  alreadyClaimed={beneficiaryRecord.claimed}
                  initialInviteEmail={beneficiaryRecord.claimEmail}
                />
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="mb-4 text-lg font-black text-zinc-950">Banner Image</h2>
            <div className="flex items-center gap-4">
              {form.banner && (
                <img src={form.banner} alt="Banner" className="h-20 w-32 shrink-0 rounded-xl border border-zinc-200 object-cover" />
              )}
              <ImageUploadWithCrop
                bucket="fundraiser-media"
                folder="fundraiser-photos"
                aspectRatio={FUNDRAISER_PHOTO_ASPECT_RATIO}
                onUploaded={(url) => update("banner", url)}
                onError={setError}
                label={form.banner ? "Change banner" : "Upload banner"}
              />
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-black text-zinc-950">Banner Carousel Photos</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">
                Add as many photos as you need. These appear at the top of the fundraiser and can each have a caption.
              </p>
            </div>
            <div className="space-y-4">
              {galleryItems.map((item, index) => (
                <div key={index} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <div>
                      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-zinc-500">Photo {index + 1}</span>
                      <div className="flex items-center gap-3">
                        {item.url && (
                          <img src={item.url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-zinc-200 object-cover" />
                        )}
                        <ImageUploadWithCrop
                          bucket="fundraiser-media"
                          folder="fundraiser-photos"
                          aspectRatio={FUNDRAISER_PHOTO_ASPECT_RATIO}
                          onUploaded={(url) => updateGalleryItem(index, "url", url)}
                          onError={setError}
                          label={item.url ? "Change photo" : "Upload photo"}
                        />
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-zinc-500">Caption</span>
                      <input
                        value={item.caption}
                        onChange={(event) => updateGalleryItem(index, "caption", event.target.value)}
                        placeholder="Caption for this photo"
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeGalleryItem(index)}
                      disabled={galleryItems.length === 1}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addGalleryItem}
              className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-black text-green-700 hover:bg-green-100"
            >
              Add another photo
            </button>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="mb-4 text-lg font-black text-zinc-950">Category</h2>
            <label className="block">
              <span className="mb-2 block text-sm font-black text-zinc-800">Campaign Category *</span>
              <SearchableSelect
                options={CAMPAIGN_CATEGORIES}
                value={form.category}
                onChange={(val) => update("category", val)}
                placeholder="Select a category..."
                accent="green"
              />
              {!form.category && (
                <p className="mt-1.5 text-xs font-semibold text-red-600">Please select a category.</p>
              )}
            </label>
          </div>
          <input value={form.video_url} onChange={(event) => update("video_url", event.target.value)} placeholder="Campaign video URL" className={inputClass} />
          <RichTextEditor
            value={form.story}
            onChange={(val) => update("story", val)}
            placeholder="Campaign story"
            accent="green"
          />

          <button disabled={saving} className="w-full rounded-2xl bg-green-500 py-5 text-lg font-black text-white transition hover:bg-green-600 disabled:bg-green-300">
            {saving ? "Saving..." : "Save Fundraiser"}
          </button>
        </form>
      </section>
    </main>
  );
}
