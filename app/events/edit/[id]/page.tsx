"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/editor/RichTextEditor";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";

const EVENT_BANNER_ASPECT = 16 / 9;


type Organizer = { id: string; name: string };
type Ticket = { id: string; name: string; price: number; quantity: number };

function generateSlug(title: string) {
  return title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.id as string;
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [slug, setSlug] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [form, setForm] = useState({
    organizer_id: "",
    title: "",
    category: "",
    event_type: "In person",
    event_date: "",
    end_date: "",
    venue: "",
    city: "",
    banner: "",
    description: "",
    source_organizer_name: "",
    source_organizer_url: "",
    source_organizer_description: "",
    ticket1_name: "",
    ticket1_price: "",
    ticket2_name: "",
    ticket2_price: "",
  });

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
        .select("status")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.status === "suspended") {
        router.push("/login?suspended=1");
        return;
      }

      const { data: organizerRows } = await supabase
        .from("organizers")
        .select("id, name")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      const ownedOrganizerIds = (organizerRows ?? []).map((organizer) => organizer.id);
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (
        eventError ||
        !event ||
        (
          event.user_id !== session.user.id &&
          !ownedOrganizerIds.includes(event.organizer_id)
        )
      ) {
        setError("Event not found or you do not have access.");
        setChecking(false);
        return;
      }

      const { data: ticketRows } = await supabase
        .from("tickets")
        .select("id, name, price, quantity")
        .eq("event_id", eventId)
        .order("price", { ascending: true });

      const loadedTickets = ticketRows ?? [];
      setOrganizers(organizerRows ?? []);
      setTickets(loadedTickets);
      setSlug(event.slug);
      setForm({
        organizer_id: event.organizer_id || "",
        title: event.title || "",
        category: event.category || "",
        event_type: event.event_type || "In person",
        event_date: toDateTimeLocal(event.event_date),
        end_date: toDateTimeLocal(event.end_date),
        venue: event.venue || "",
        city: event.city || "",
        banner: event.banner || "",
        description: event.description || "",
        source_organizer_name: event.source_organizer_name || "",
        source_organizer_url: event.source_organizer_url || "",
        source_organizer_description: event.source_organizer_description || "",
        ticket1_name: loadedTickets[0]?.name || "",
        ticket1_price: loadedTickets[0]?.price?.toString() || "",
        ticket2_name: loadedTickets[1]?.name || "",
        ticket2_price: loadedTickets[1]?.price?.toString() || "",
      });
      setChecking(false);
    }

    if (eventId) load();
  }, [eventId, router]);

  function update(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function upsertTicket(index: number, name: string, price: string, quantity: number) {
    if (!name && !price) return;
    const existing = tickets[index];
    const payload = { event_id: eventId, name: name || "General Admission", price: Number(price) || 0, quantity };
    if (existing) {
      const { error: ticketError } = await supabase.from("tickets").update(payload).eq("id", existing.id);
      if (ticketError) throw new Error(ticketError.message);
      return;
    }
    const { error: ticketError } = await supabase.from("tickets").insert(payload);
    if (ticketError) throw new Error(ticketError.message);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!organizers.some((organizer) => organizer.id === form.organizer_id)) {
        throw new Error("Choose an organizer profile that belongs to your account.");
      }

      const nextSlug = generateSlug(form.title);
      const { error: updateError } = await supabase
        .from("events")
        .update({
          title: form.title,
          slug: nextSlug,
          category: form.category,
          event_type: form.event_type,
          event_date: form.event_date,
          end_date: form.end_date || null,
          venue: form.venue,
          city: form.city,
          banner: form.banner,
          description: form.description,
          organizer_id: form.organizer_id,
          source_organizer_name: form.source_organizer_name || null,
          source_organizer_url: form.source_organizer_url || null,
          source_organizer_description: form.source_organizer_description || null,
        })
        .eq("id", eventId);

      if (updateError) throw new Error(updateError.message);
      await upsertTicket(0, form.ticket1_name, form.ticket1_price, 100);
      await upsertTicket(1, form.ticket2_name, form.ticket2_price, 50);
      router.push(`/events/${nextSlug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update event.");
    } finally {
      setSaving(false);
    }
  }

  const isImported =
    Boolean(form.source_organizer_name) ||
    Boolean(form.source_organizer_url) ||
    Boolean(form.source_organizer_description);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-lg font-semibold text-zinc-500">Loading event...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto max-w-4xl px-6 py-14">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">Event</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl lg:text-5xl">Edit Event</h1>
            <p className="mt-3 text-zinc-600">Update imported or manually created event details.</p>
          </div>
          {slug && (
            <Link href={`/events/${slug}`} className="font-black text-orange-600 hover:text-orange-700">
              View event
            </Link>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <label className="block">
            <span className="mb-2 block font-bold">Organization Profile</span>
            <select
              value={form.organizer_id}
              onChange={(event) => update("organizer_id", event.target.value)}
              required
              className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            >
              <option value="">Select organizer</option>
              {organizers.map((organizer) => (
                <option key={organizer.id} value={organizer.id}>
                  {organizer.name}
                </option>
              ))}
            </select>
          </label>

          <input
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            required
            placeholder="Event title"
            className="w-full rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
          />

          <div className="grid gap-5 md:grid-cols-2">
            <input
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
              placeholder="Category"
              className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            />
            <select
              value={form.event_type}
              onChange={(event) => update("event_type", event.target.value)}
              className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            >
              <option>In person</option>
              <option>Virtual</option>
              <option>Hybrid</option>
            </select>
            <input
              value={form.event_date}
              onChange={(event) => update("event_date", event.target.value)}
              type="datetime-local"
              className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            />
            <input
              value={form.end_date}
              onChange={(event) => update("end_date", event.target.value)}
              type="datetime-local"
              className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            />
            <input
              value={form.venue}
              onChange={(event) => update("venue", event.target.value)}
              placeholder="Venue"
              className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            />
            <input
              value={form.city}
              onChange={(event) => update("city", event.target.value)}
              placeholder="City"
              className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
            />
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="mb-4 text-lg font-black text-zinc-950">Event Banner</h2>
            <ImageUploadWithCrop
              value={form.banner}
              aspectRatio={EVENT_BANNER_ASPECT}
              previewClassName="h-40 w-full rounded-2xl"
              label="Upload banner"
              bucket="event-banners"
              folder={eventId}
              onUploaded={(url) => update("banner", url)}
              onRemove={() => update("banner", "")}
            />
          </div>

          <div className="space-y-2">
            <span className="block font-bold">Event Description</span>
            <RichTextEditor
              value={form.description}
              onChange={(val) => update("description", val)}
              placeholder="Event description"
              accent="orange"
            />
          </div>

          {/* Only shown for imported events that have source organizer data */}
          {isImported && (
            <div className="rounded-2xl bg-orange-50 p-5">
              <h2 className="text-xl font-black">Imported Organization Details</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <input
                  value={form.source_organizer_name}
                  onChange={(event) => update("source_organizer_name", event.target.value)}
                  placeholder="Source organizer name"
                  className="rounded-2xl border border-orange-200 px-5 py-4 outline-none focus:border-orange-500"
                />
                <input
                  value={form.source_organizer_url}
                  onChange={(event) => update("source_organizer_url", event.target.value)}
                  placeholder="Source organizer URL"
                  className="rounded-2xl border border-orange-200 px-5 py-4 outline-none focus:border-orange-500"
                />
                <textarea
                  value={form.source_organizer_description}
                  onChange={(event) => update("source_organizer_description", event.target.value)}
                  rows={3}
                  placeholder="Source organizer bio"
                  className="md:col-span-2 rounded-2xl border border-orange-200 px-5 py-4 outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-4 text-xl font-black">Tickets</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <input
                value={form.ticket1_name}
                onChange={(event) => update("ticket1_name", event.target.value)}
                placeholder="Ticket name"
                className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
              />
              <input
                value={form.ticket1_price}
                onChange={(event) => update("ticket1_price", event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
              />
              <input
                value={form.ticket2_name}
                onChange={(event) => update("ticket2_name", event.target.value)}
                placeholder="Second ticket name"
                className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
              />
              <input
                value={form.ticket2_price}
                onChange={(event) => update("ticket2_price", event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Second price"
                className="rounded-2xl border border-zinc-300 px-5 py-4 outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <button
            disabled={saving}
            className="w-full rounded-2xl bg-orange-500 py-5 text-lg font-black text-white transition hover:bg-orange-600 disabled:bg-orange-300"
          >
            {saving ? "Saving..." : "Save Event"}
          </button>
        </form>
      </section>
    </main>
  );
}
