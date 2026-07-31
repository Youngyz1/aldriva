"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type GoFundMeSource = {
  id: string;
  title: string | null;
  organizer: string | null;
  source_url: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_message: string | null;
};

function formatSyncTime(value: string | null) {
  if (!value) return "Never synced";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isGoFundMeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.includes("gofundme.com");
  } catch {
    return false;
  }
}

export default function GoFundMeSyncPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState("");
  const [sources, setSources] = useState<GoFundMeSource[]>([]);
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function load(user: string) {
    const { data, error: sourceError } = await supabase
      .from("gofundme_sources")
      .select("*")
      .eq("user_id", user)
      .order("created_at", { ascending: false });

    if (sourceError) {
      setError(
        sourceError.message.includes("gofundme_sources")
          ? "Run db/gofundme_sources_schema.sql in Supabase before adding GoFundMe sources."
          : sourceError.message
      );
    }

    setSources(data ?? []);
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
      if (!sourceUrl.trim()) throw new Error("Enter the GoFundMe fundraiser URL.");
      if (!isGoFundMeUrl(sourceUrl)) throw new Error("Enter a valid GoFundMe URL.");

      const normalizedUrl = new URL(sourceUrl).toString();
      const { error: insertError } = await supabase.from("gofundme_sources").insert({
        user_id: userId,
        title: title.trim() || null,
        organizer: organizer.trim() || null,
        source_url: normalizedUrl,
        enabled: true,
      });

      if (insertError) throw new Error(insertError.message);

      setTitle("");
      setOrganizer("");
      setSourceUrl("");
      setMessage("GoFundMe source added.");
      await load(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add GoFundMe source.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(sourceId?: string) {
    setSyncingId(sourceId ?? "all");
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/gofundme-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : { syncAll: true }),
      });
      const payload = await res.json();

      if (!res.ok) throw new Error(payload.error || "GoFundMe sync failed.");

      setMessage(`Imported ${payload.imported}. Updated ${payload.updated}.`);
      await load(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "GoFundMe sync failed.");
    } finally {
      setSyncingId(null);
    }
  }

  async function toggleSource(source: GoFundMeSource) {
    setError("");
    const { error: updateError } = await supabase
      .from("gofundme_sources")
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
    if (!confirm("Delete this GoFundMe source?")) return;

    const { error: deleteError } = await supabase
      .from("gofundme_sources")
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
            <p className="text-base font-black uppercase tracking-wide text-green-600">GoFundMe</p>
            <h1 className="mt-2 text-5xl font-black">Fundraiser Sync</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
              Refresh selected GoFundMe fundraiser pages into your local fundraising campaigns.
            </p>
          </div>
          <Link href="/dashboard" className="text-base font-black text-green-600 hover:text-green-700">
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
              <h2 className="text-2xl font-black">Add Fundraiser</h2>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  GoFundMe URL
                </span>
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.gofundme.com/f/..."
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-green-500"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Optional override"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-green-500"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  Organization
                </span>
                <input
                  value={organizer}
                  onChange={(event) => setOrganizer(event.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-green-500"
                />
              </label>

              <button
                onClick={handleCreateSource}
                disabled={saving}
                className="mt-5 w-full rounded-xl bg-green-600 px-5 py-4 font-black text-white transition hover:bg-green-700 disabled:bg-green-300"
              >
                {saving ? "Saving..." : "Add Source"}
              </button>
            </div>
          </aside>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-3xl font-black">Sources</h2>
                <p className="mt-1 text-zinc-500">{sources.length} GoFundMe fundraisers connected.</p>
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
                <h3 className="text-2xl font-black">No GoFundMe sources yet.</h3>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((source) => (
                  <div key={source.id} className="rounded-2xl border border-zinc-200 p-5">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-black">{source.title || "GoFundMe fundraiser"}</h3>
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-black ${
                              source.enabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {source.enabled ? "Enabled" : "Paused"}
                          </span>
                        </div>
                        {source.organizer && <p className="mt-1 font-semibold text-zinc-500">{source.organizer}</p>}
                        <a
                          href={source.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block truncate font-semibold text-green-600 hover:text-green-700"
                        >
                          {source.source_url}
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
                          className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:bg-green-300"
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
