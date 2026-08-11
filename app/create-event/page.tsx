"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

import {
  CreatorField,
  CreatorPanel,
  CreatorWorkspace,
  inputClass,
} from "@/components/CreatorWorkspace";
import { supabase } from "@/lib/supabase";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";
import RichTextEditor from "@/components/editor/RichTextEditor";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const EVENT_BANNER_ASPECT = 16 / 9;

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

type Organizer = {
  id: string;
  name: string;
  photo: string | null;
};

const EVENT_STEPS = [
  { label: "Event Details" },
  { label: "Date & Time" },
  { label: "Location" },
  { label: "Tickets & Pricing" },
  { label: "Review & Publish" },
];

const VENUE_TEMPLATES = [
  { label: "General Admission", value: "none", detail: "No assigned seats" },
  { label: "Small Venue", value: "small", detail: "50 seats, 5 rows x 10" },
  { label: "Medium Hall", value: "medium", detail: "200 seats, floor and balcony" },
  { label: "Large Arena", value: "large", detail: "500 seats, floor and VIP" },
];

const TEMPLATE_CONFIG: Record<string, { sections: { name: string; rows: number; seatsPerRow: number }[] }> = {
  small: { sections: [{ name: "Main", rows: 5, seatsPerRow: 10 }] },
  medium: { sections: [{ name: "Floor", rows: 5, seatsPerRow: 20 }, { name: "Balcony", rows: 5, seatsPerRow: 20 }] },
  large: { sections: [{ name: "Floor A", rows: 5, seatsPerRow: 25 }, { name: "Floor B", rows: 5, seatsPerRow: 25 }, { name: "VIP", rows: 2, seatsPerRow: 20 }] },
};

function generateSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}


export default function CreateEventPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [venueTemplate, setVenueTemplate] = useState("none");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [visibility, setVisibility] = useState("public");

  const [form, setForm] = useState({
    organizer_id: "",
    title: "",
    category: "Music",
    event_type: "In person",
    event_date: "",
    end_date: "",
    venue: "",
    city: "",
    description: "",
    ticket1_name: "Regular",
    ticket1_price: "",
    ticket1_quantity: "100",
    ticket2_name: "VIP",
    ticket2_price: "",
    ticket2_quantity: "50",
    ticket3_name: "VVIP",
    ticket3_price: "",
    ticket3_quantity: "20",
    latitude: "",
    longitude: "",
  });

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
        .order("created_at", { ascending: false });

      if (organizerError) setError(organizerError.message);

      const profiles = organizerProfiles ?? [];
      const requestedOrganizerId = new URLSearchParams(window.location.search).get("organizer");
      const selectedOrganizerId =
        requestedOrganizerId && profiles.some((organizer) => organizer.id === requestedOrganizerId)
          ? requestedOrganizerId
          : profiles[0]?.id || "";
      setOrganizers(profiles);
      setForm((current) => ({
        ...current,
        organizer_id: current.organizer_id || selectedOrganizerId,
      }));
      setChecking(false);
    });
  }, [router]);

  const organizerName = useMemo(
    () => organizers.find((organizer) => organizer.id === form.organizer_id)?.name || "Organization",
    [form.organizer_id, organizers]
  );

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setNotice("");
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function saveDraft() {
    localStorage.setItem("event-draft", JSON.stringify({ form, venueTemplate, visibility }));
    setNotice("Draft saved on this device.");
  }

  function nextStep() {
    setCurrentStep((step) => Math.min(step + 1, EVENT_STEPS.length - 1));
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

    // organizer_id is always optional — "Personal event" (empty) is a
    // first-class, intentional choice in the picker below, not just a
    // fallback for users with none. Only validate that a non-empty
    // selection actually belongs to this account.
    if (form.organizer_id && !organizers.some((organizer) => organizer.id === form.organizer_id)) {
      setError("Select one of your organizer profiles before publishing an event.");
      setLoading(false);
      return;
    }

    let video_url: string | null = null;
    if (videoFile) {
      setUploadProgress("Uploading video...");
      const ext = videoFile.name.split(".").pop();
      const fileName = `${slug}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("event-videos").upload(fileName, videoFile);

      if (uploadError) {
        setError("Video upload failed: " + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("event-videos").getPublicUrl(fileName);
      video_url = urlData.publicUrl;
      setUploadProgress("");
    }

    const { data: createdEvent, error: eventError } = await supabase
      .from("events")
      .insert({
        title: form.title,
        slug,
        description: form.description,
        category: form.category,
        event_type: form.event_type,
        venue: form.venue,
        city: form.city,
        event_date: form.event_date,
        end_date: form.end_date || null,
        video_url,
        organizer_id: form.organizer_id || null,
        user_id: session.user.id,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        visibility: visibility || "public",
      })
      .select()
      .single();

    if (eventError) {
      setError(eventError.message);
      setLoading(false);
      return;
    }

    if (bannerFile) {
      setUploadProgress("Uploading banner...");
      try {
        const bannerUrl = await uploadImage(bannerFile, "event-banners", createdEvent.id);
        const { error: bannerError } = await supabase
          .from("events")
          .update({ banner: bannerUrl })
          .eq("id", createdEvent.id);
        if (bannerError) {
          setError("Banner update failed: " + bannerError.message);
          setLoading(false);
          return;
        }
      } catch (err) {
        const message = err instanceof UploadImageError ? err.message : "Banner upload failed.";
        setError(message);
        setLoading(false);
        return;
      }
      setUploadProgress("");
    }

    const tickets = [
      { event_id: createdEvent.id, name: form.ticket1_name, price: Number(form.ticket1_price), quantity: Number(form.ticket1_quantity || 0) },
      { event_id: createdEvent.id, name: form.ticket2_name, price: Number(form.ticket2_price), quantity: Number(form.ticket2_quantity || 0) },
      { event_id: createdEvent.id, name: form.ticket3_name, price: Number(form.ticket3_price), quantity: Number(form.ticket3_quantity || 0) },
    ].filter((ticket) => ticket.name && ticket.price);

    if (tickets.length > 0) {
      const { error: ticketError } = await supabase.from("tickets").insert(tickets);
      if (ticketError) {
        setError(ticketError.message);
        setLoading(false);
        return;
      }
    }

    if (venueTemplate !== "none" && TEMPLATE_CONFIG[venueTemplate]) {
      const templateCfg = TEMPLATE_CONFIG[venueTemplate];
      const { data: layout, error: layoutError } = await supabase
        .from("venue_layouts")
        .insert({ event_id: createdEvent.id, name: "Main Venue", sections: templateCfg.sections })
        .select()
        .single();

      if (!layoutError && layout) {
        const seatRows: object[] = [];
        const rowLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        for (const section of templateCfg.sections) {
          for (let row = 0; row < section.rows; row++) {
            for (let seat = 1; seat <= section.seatsPerRow; seat++) {
              seatRows.push({
                layout_id: layout.id,
                event_id: createdEvent.id,
                section: section.name,
                row_label: rowLabels[row] || String(row + 1),
                seat_number: seat,
                status: "available",
              });
            }
          }
        }

        for (let index = 0; index < seatRows.length; index += 500) {
          await supabase.from("seats").insert(seatRows.slice(index, index + 500));
        }
      }
    }

    localStorage.removeItem("event-draft");
    router.push(`/events/${slug}`);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-lg font-semibold text-zinc-400">Checking access...</p>
      </main>
    );
  }

  const tips = [
    "Use a clear, searchable event title.",
    "Add a detailed description with audience expectations.",
    "Choose the category that best matches your event.",
    "Use a high-quality cover image.",
  ];

  const aside = (
    <>
      <CreatorPanel title="Event Tips">
        <div className="space-y-4">
          {tips.map((tip) => (
            <p key={tip} className="flex gap-3 text-sm font-semibold text-zinc-600">
              <span className="mt-1 h-2 w-2 rounded-full bg-orange-500" />
              {tip}
            </p>
          ))}
        </div>
      </CreatorPanel>

      <CreatorPanel title="Preview">
        <div className="overflow-hidden rounded-xl bg-zinc-100">
          {bannerPreview ? (
            <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${bannerPreview})` }} />
          ) : (
            <div className="flex h-32 items-center justify-center text-zinc-400">
              <i className="ti ti-photo text-4xl" aria-hidden="true" />
            </div>
          )}
        </div>
        <h3 className="mt-4 text-xl font-black">{form.title || "Event Title"}</h3>
        <p className="mt-1 text-sm font-medium text-zinc-500">{organizerName}</p>
        <div className="mt-4 space-y-2 text-sm font-semibold text-zinc-500">
          <p>{form.event_date || "Date and time"}</p>
          <p>{[form.venue, form.city].filter(Boolean).join(", ") || "Location"}</p>
          <p>{form.ticket1_price ? `From ${money(form.ticket1_price)}` : "Ticket pricing"}</p>
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
                className="mt-1 accent-orange-600"
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
        {currentStep < EVENT_STEPS.length - 1 ? (
          <button onClick={nextStep} type="button" className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700">
            Next: {EVENT_STEPS[currentStep + 1].label}
          </button>
        ) : (
          <button disabled={loading} form="create-event-form" type="submit" className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:bg-orange-300">
            {loading ? uploadProgress || "Publishing..." : "Publish Event"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <CreatorWorkspace
      active="Events"
      accent="orange"
      title="Create Event"
      description="Fill in the details below to create your event."
      email={email}
      steps={EVENT_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onSaveDraft={saveDraft}
      aside={aside}
      footer={footer}
    >
      <form id="create-event-form" onSubmit={handleSubmit} className="space-y-5">
        {(error || notice) && (
          <div className={`rounded-2xl border px-5 py-4 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || notice}
          </div>
        )}

        {currentStep === 0 && (
          <>
            <CreatorPanel title="Basic Information">
              <div className="grid gap-5">
                {/* Optional organizational affiliation — only shown when
                    the user actually has an organizer to attach. With
                    none, this event is simply personal (organizer_id
                    stays null); nothing here forces creating one.
                    "Personal event" is always selectable even when
                    organizers exist, since affiliation is opt-in, not
                    the default state. */}
                {organizers.length > 0 && (
                  <CreatorField label="Organization Profile (optional)">
                    <select name="organizer_id" value={form.organizer_id} onChange={handleChange} className={inputClass}>
                      <option value="">Personal event (no organizer)</option>
                      {organizers.map((organizer) => <option key={organizer.id} value={organizer.id}>{organizer.name}</option>)}
                    </select>
                  </CreatorField>
                )}

                <CreatorField label="Event Title">
                  <input name="title" value={form.title} onChange={handleChange} required type="text" placeholder="Annual Charity Gala Dinner" className={inputClass} />
                </CreatorField>

                <CreatorField label="Event Description">
                  <RichTextEditor
                    value={form.description}
                    onChange={(val) => setForm((c) => ({ ...c, description: val }))}
                    placeholder="Tell people about your event..."
                    accent="orange"
                  />
                </CreatorField>

                <div className="grid gap-5 md:grid-cols-2">
                  <CreatorField label="Category">
                    <select name="category" value={form.category} onChange={handleChange} className={inputClass}>
                      {["Music", "Business", "Technology", "Sports", "Dating", "Education", "Nightlife", "Holidays", "Performing & Visual Arts", "Charity", "Community"].map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </CreatorField>
                  <CreatorField label="Event Type">
                    <select name="event_type" value={form.event_type} onChange={handleChange} className={inputClass}>
                      <option>In person</option>
                      <option>Virtual</option>
                      <option>Hybrid</option>
                    </select>
                  </CreatorField>
                </div>
              </div>
            </CreatorPanel>

            <CreatorPanel title="Event Image">
              <div className="grid gap-5">
                <CreatorField label="Event Banner" hint="Wide image, cropped to a 16:9 banner shape.">
                  <ImageUploadWithCrop
                    value={bannerPreview}
                    aspectRatio={EVENT_BANNER_ASPECT}
                    previewClassName="h-32 w-full rounded-xl"
                    label="Upload banner"
                    onCropped={(file, previewUrl) => {
                      setNotice("");
                      setBannerFile(file);
                      setBannerPreview(previewUrl);
                    }}
                    onRemove={() => {
                      setBannerFile(null);
                      setBannerPreview("");
                    }}
                  />
                </CreatorField>
                <CreatorField label="Event Video" hint="Optional. MP4, MOV, or AVI uploads are supported by your storage bucket.">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm font-semibold"
                  />
                </CreatorField>
              </div>
            </CreatorPanel>
          </>
        )}

        {currentStep === 1 && (
          <CreatorPanel title="Date & Time">
            <div className="grid gap-5 md:grid-cols-2">
              <CreatorField label="Start Date & Time">
                <input name="event_date" value={form.event_date} onChange={handleChange} required type="datetime-local" className={inputClass} />
              </CreatorField>
              <CreatorField label="End Date & Time">
                <input name="end_date" value={form.end_date} onChange={handleChange} type="datetime-local" className={inputClass} />
              </CreatorField>
            </div>
          </CreatorPanel>
        )}

        {currentStep === 2 && (
          <CreatorPanel title="Location">
            <div className="grid gap-5">
              <CreatorField label="Address Search">
                <AddressAutocomplete
                  inputClassName={inputClass}
                  onSelect={(result) => {
                    setNotice("");
                    setForm((current) => ({
                      ...current,
                      latitude: String(result.lat),
                      longitude: String(result.lng),
                      city: result.city || current.city,
                    }));
                  }}
                />
              </CreatorField>

              <div className="grid gap-5 md:grid-cols-2">
                <CreatorField label="Venue">
                  <input name="venue" value={form.venue} onChange={handleChange} type="text" placeholder="Abidjan Stadium" className={inputClass} />
                </CreatorField>
                <CreatorField label="City">
                  <input name="city" value={form.city} onChange={handleChange} type="text" placeholder="Abidjan" className={inputClass} />
                </CreatorField>
              </div>

              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-black">Venue Map Pin</p>
                    <p className="mt-1 text-sm font-medium text-zinc-500">
                      {form.latitude && form.longitude
                        ? `Location set: ${parseFloat(form.latitude).toFixed(5)}, ${parseFloat(form.longitude).toFixed(5)}`
                        : "Set a map pin so attendees can find the venue."}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowMapPicker((open) => !open)} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-black text-white">
                    {showMapPicker ? "Hide Map" : "Set Map Pin"}
                  </button>
                </div>
                {showMapPicker && (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
                    <LocationPicker
                      lat={form.latitude ? parseFloat(form.latitude) : undefined}
                      lng={form.longitude ? parseFloat(form.longitude) : undefined}
                      onPick={(lat, lng) => setForm((current) => ({ ...current, latitude: String(lat), longitude: String(lng) }))}
                    />
                  </div>
                )}
              </div>
            </div>
          </CreatorPanel>
        )}

        {currentStep === 3 && (
          <>
            <CreatorPanel title="Tickets & Pricing">
              <div className="space-y-4">
                {[
                  ["ticket1", form.ticket1_name, form.ticket1_price, form.ticket1_quantity],
                  ["ticket2", form.ticket2_name, form.ticket2_price, form.ticket2_quantity],
                  ["ticket3", form.ticket3_name, form.ticket3_price, form.ticket3_quantity],
                ].map(([prefix]) => (
                  <div key={prefix} className="grid gap-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 md:grid-cols-[1fr_140px_140px]">
                    <input name={`${prefix}_name`} value={form[`${prefix}_name` as keyof typeof form]} onChange={handleChange} placeholder="Ticket name" className={inputClass} />
                    <input name={`${prefix}_price`} value={form[`${prefix}_price` as keyof typeof form]} onChange={handleChange} type="number" min="0" placeholder="Price" className={inputClass} />
                    <input name={`${prefix}_quantity`} value={form[`${prefix}_quantity` as keyof typeof form]} onChange={handleChange} type="number" min="0" placeholder="Qty" className={inputClass} />
                  </div>
                ))}
              </div>
            </CreatorPanel>

            <CreatorPanel title="Venue Layout & Seat Map">
              <div className="grid gap-3 sm:grid-cols-2">
                {VENUE_TEMPLATES.map((template) => (
                  <button
                    key={template.value}
                    type="button"
                    onClick={() => setVenueTemplate(template.value)}
                    className={`rounded-2xl border px-5 py-4 text-left transition ${
                      venueTemplate === template.value
                        ? "border-orange-500 bg-orange-50 text-orange-900"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <p className="font-black">{template.label}</p>
                    <p className="mt-1 text-sm font-medium text-zinc-500">{template.detail}</p>
                  </button>
                ))}
              </div>
            </CreatorPanel>
          </>
        )}

        {currentStep === 4 && (
          <CreatorPanel title="Review & Publish">
            <div className="grid gap-4">
              {[
                ["Event", form.title || "Not set"],
                ["Organization", organizerName],
                ["Category", `${form.category} / ${form.event_type}`],
                ["Date", form.event_date || "Not set"],
                ["Location", [form.venue, form.city].filter(Boolean).join(", ") || "Not set"],
                ["Tickets", [form.ticket1_name, form.ticket2_name, form.ticket3_name].filter(Boolean).join(", ")],
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
