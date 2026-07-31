"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Organizer = {
  id: string;
  name: string;
};

type EventbriteSource = {
  id: string;
  organizer_id: string | null;
  organizer_name: string;
  organizer_url: string;
  organizer_eventbrite_id: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_message: string | null;
};

function eventbriteOrganizerIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return path.match(/\/o\/(?:.*-)?(\d+)$/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function normalizeEventbriteOrganizerUrl(url: string, organizerId: string) {
  try {
    const parsed = new URL(url);
    return `https://${parsed.hostname}/o/${organizerId}`;
  } catch {
    return url.trim();
  }
}

function formatSyncTime(value: string | null) {
  if (!value) return "Never synced";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventbriteSyncPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState("");
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [sources, setSources] = useState<EventbriteSource[]>([]);
  const [organizerId, setOrganizerId] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const sourceEventbriteId = useMemo(() => eventbriteOrganizerIdFromUrl(sourceUrl), [sourceUrl]);
  const selectedOrganizerName = organizers.find((organizer) => organizer.id === organizerId)?.name ?? "";

  async function load(user: string) {
    const [{ data: organizerRows, error: organizerError }, { data: sourceRows, error: sourceError }] =
      await Promise.all([
        supabase
          .from("organizers")
          .select("id, name")
          .eq("user_id", user)
          .order("created_at", { ascending: false }),
        supabase
          .from("eventbrite_sources")
          .select("*")
          .eq("user_id", user)
          .order("created_at", { ascending: false }),
      ]);

    if (organizerError) setError(organizerError.message);
    if (sourceError) {
      setError(
        sourceError.message.includes("eventbrite_sources")
          ? "Run db/eventbrite_sources_schema.sql in Supabase before adding Eventbrite sources."
          : sourceError.message
      );
    }

    const userOrganizers = organizerRows ?? [];
    setOrganizers(userOrganizers);
    setOrganizerId((current) => current);
    setSources(sourceRows ?? []);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }

      setUserId(data.session.user.id);
      await load(data.session.user.id);
      setChecking(false);
    });
  }, [router]);

  async function handleCreateSource() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (!sourceUrl.trim()) throw new Error("Enter the Eventbrite organizer URL.");
      if (!sourceEventbriteId) throw new Error("The Eventbrite organizer URL should look like https://www.eventbrite.com/o/123456 or https://www.eventbrite.com/o/name-123456.");

      const organizerName = sourceName.trim() || selectedOrganizerName || `Eventbrite Organizer ${sourceEventbriteId}`;

      const { error: insertError } = await supabase.from("eventbrite_sources").insert({
        user_id: userId,
        organizer_id: organizerId || null,
        organizer_name: organizerName,
        organizer_url: normalizeEventbriteOrganizerUrl(sourceUrl, sourceEventbriteId),
        organizer_eventbrite_id: sourceEventbriteId,
        enabled: true,
      });

      if (insertError) throw new Error(insertError.message);

      setSourceName("");
      setSourceUrl("");
      setMessage("Eventbrite source added.");
      await load(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add Eventbrite source.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(sourceId?: string) {
    setSyncingId(sourceId ?? "all");
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/eventbrite-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : { syncAll: true }),
      });
      const payload = await res.json();

      if (!res.ok) throw new Error(payload.error || "Eventbrite sync failed.");

      setMessage(`Imported ${payload.imported}. Skipped ${payload.skipped}.`);
      await load(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eventbrite sync failed.");
    } finally {
      setSyncingId(null);
    }
  }

  async function toggleSource(source: EventbriteSource) {
    setError("");
    const { error: updateError } = await supabase
      .from("eventbrite_sources")
      .update({ enabled: !source.enabled })
      .eq("id", source.id)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load(userId);
  }

  async function deleteSource(sourceId: string) {
    if (!confirm("Delete this Eventbrite source?")) return;

    const { error: deleteError } = await supabase
      .from("eventbrite_sources")
      .delete()
      .eq("id", sourceId)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await load(userId);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-lg font-semibold text-zinc-500">Checking access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
       

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-base font-black uppercase tracking-wide text-orange-600">Eventbrite</p>
            <h1 className="mt-2 text-5xl font-black">Organization Sync</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
              Pull future events from selected Eventbrite organizers into your local event listings.
            </p>
          </div>
          <Link href="/dashboard" className="text-base font-black text-orange-600 hover:text-orange-700">
            Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 font-semibold text-green-700">
            {message}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black">Add Organization</h2>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  Local organizer
                </span>
                <select
                  value={organizerId}
                  onChange={(event) => setOrganizerId(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-bold outline-none focus:border-orange-500"
                >
                  <option value="">Auto-create from Eventbrite organizer</option>
                  {organizers.map((organizer) => (
                    <option key={organizer.id} value={organizer.id}>
                      {organizer.name}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-sm text-zinc-500">
                  Leave this on auto-create to pull the Eventbrite organizer onto your site.
                </span>
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  Eventbrite organizer name
                </span>
                <input
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                  placeholder={selectedOrganizerName || "Optional display name"}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-orange-500"
                />
                <span className="mt-2 block text-sm text-zinc-500">
                  Optional. If blank, the selected local organizer name will be used.
                </span>
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  Eventbrite organizer URL
                </span>
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.eventbrite.com/o/13309940933"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-orange-500"
                />
              </label>

              {sourceEventbriteId && (
                <p className="mt-3 text-sm font-bold text-zinc-500">
                  Eventbrite ID: {sourceEventbriteId}
                </p>
              )}

              <button
                onClick={handleCreateSource}
                disabled={saving}
                className="mt-5 w-full rounded-xl bg-orange-600 px-5 py-4 font-black text-white transition hover:bg-orange-700 disabled:bg-orange-300"
              >
                {saving ? "Saving..." : "Add Source"}
              </button>

              {organizers.length === 0 && (
                <Link href="/create-organizer" className="mt-4 inline-block font-bold text-orange-600">
                  Create an organizer profile
                </Link>
              )}
            </div>
          </aside>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-3xl font-black">Sources</h2>
                <p className="mt-1 text-zinc-500">{sources.length} Eventbrite organizers connected.</p>
              </div>
              <button
                onClick={() => handleSync()}
                disabled={sources.length === 0 || syncingId !== null}
                className="rounded-xl bg-zinc-950 px-6 py-4 font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {syncingId === "all" ? "Syncing..." : "Sync All"}
              </button>
            </div>

            {sources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-8 py-20 text-center">
                <h3 className="text-2xl font-black">No Eventbrite sources yet.</h3>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((source) => (
                  <div key={source.id} className="rounded-2xl border border-zinc-200 p-5">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-black">{source.organizer_name}</h3>
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-black ${
                              source.enabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {source.enabled ? "Enabled" : "Paused"}
                          </span>
                        </div>
                        <a
                          href={source.organizer_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block truncate font-semibold text-orange-600 hover:text-orange-700"
                        >
                          {source.organizer_url}
                        </a>
                        <p className="mt-2 text-sm font-semibold text-zinc-500">
                          {formatSyncTime(source.last_synced_at)}
                          {source.last_sync_message ? ` • ${source.last_sync_message}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => handleSync(source.id)}
                          disabled={!source.enabled || syncingId !== null}
                          className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-700 disabled:bg-orange-300"
                        >
                          {syncingId === source.id ? "Syncing..." : "Sync"}
                        </button>
                        <button
                          onClick={() => toggleSource(source)}
                          className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-black text-zinc-700 transition hover:bg-zinc-50"
                        >
                          {source.enabled ? "Pause" : "Enable"}
                        </button>
                        <button
                          onClick={() => deleteSource(source.id)}
                          className="rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
