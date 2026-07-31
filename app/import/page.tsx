"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

type ImportMode = "events" | "fundraisers";

type Organizer = {
  id: string;
  name: string;
};

type CsvRow = Record<string, string>;

type PreviewRow = {
  rowNumber: number;
  data: CsvRow;
  errors: string[];
};

const eventColumns = [
  "title",
  "description",
  "category",
  "event_date",
  "venue",
  "city",
  "banner",
  "ticket1_name",
  "ticket1_price",
  "ticket2_name",
  "ticket2_price",
  "source_organizer_name",
  "source_organizer_url",
  "source_organizer_description",
  "eventbrite_event_id",
  "source_url",
];

const fundraiserColumns = [
  "title",
  "story",
  "goal",
  "organizer",
  "banner",
  "video_url",
  "source_url",
  "category",
];

function generateSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

function parseImportPrice(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

function validateRow(mode: ImportMode, row: CsvRow, seenSlugs: Set<string>) {
  const errors: string[] = [];
  const title = row.title?.trim();
  const slug = title ? generateSlug(title) : "";

  if (!title) errors.push("Missing title");
  if (title && !slug) errors.push("Title cannot create a valid slug");
  if (slug && seenSlugs.has(slug)) errors.push("Duplicate title in this CSV");

  if (mode === "events") {
    if (!row.event_date?.trim()) errors.push("Missing event_date");
    if (row.event_date && Number.isNaN(new Date(row.event_date).getTime())) {
      errors.push("event_date is not a valid date");
    }

    ["ticket1_price", "ticket2_price"].forEach((field) => {
      if (row[field]) {
        const price = parseImportPrice(row[field]);
        if (price === null) {
          errors.push(`${field} must be a valid price`);
        } else if (price < 0) {
          errors.push(`${field} cannot be negative`);
        }
      }
    });
  } else {
    if (!row.story?.trim()) errors.push("Missing story");
    if (!row.goal?.trim()) errors.push("Missing goal");
    if (row.goal) {
      const goal = Number(row.goal);
      if (!Number.isFinite(goal)) {
        errors.push("goal must be a valid amount");
      } else if (goal <= 0) {
        errors.push("goal must be greater than 0");
      }
    }
  }

  if (slug) seenSlugs.add(slug);
  return errors;
}

function buildPreviewRows(mode: ImportMode, rows: CsvRow[], firstRowNumber: number) {
  const seenSlugs = new Set<string>();

  return rows.map((row, index) => ({
    rowNumber: firstRowNumber + index,
    data: row,
    errors: validateRow(mode, row, seenSlugs),
  }));
}

const optionalImportFields = [
  "source_url",
  "source_organizer_name",
  "source_organizer_url",
  "source_organizer_description",
  "eventbrite_event_id",
];

function isMissingOptionalImportColumn(message: string) {
  const normalized = message.toLowerCase();
  return optionalImportFields.some((field) => normalized.includes(field));
}

function omitOptionalImportFields<T extends Record<string, unknown>>(row: T) {
  const copy = { ...row };
  optionalImportFields.forEach((field) => {
    delete copy[field];
  });
  return copy;
}

function descriptionWithSourceOrganizer(row: CsvRow) {
  const sourceOrganizer = [
    row.source_organizer_name ? `Source organizer: ${row.source_organizer_name}` : "",
    row.source_organizer_url ? `Source organizer URL: ${row.source_organizer_url}` : "",
    row.source_organizer_description ? `Source organizer bio: ${row.source_organizer_description}` : "",
  ].filter(Boolean);

  return [row.description || "", ...sourceOrganizer].filter(Boolean).join("\n\n");
}

function exampleCsv(mode: ImportMode) {
  if (mode === "events") {
    return `${eventColumns.join(",")}\nAfrobeats Night,Live music and food,Music,2026-08-20T19:00,Main Hall,Lagos,https://example.com/banner.jpg,Regular,25,VIP,100,Example Organization,https://example.com/organizer,Host profile from the source,https://example.com/event`;
  }

  return `${fundraiserColumns.join(",")}\nCommunity School Fund,Help build a local school,20000,Community Future Initiative,https://example.com/banner.jpg,,https://example.com/fundraiser`;
}

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-50">
          <p className="text-lg font-semibold text-zinc-500">Loading import tools...</p>
        </main>
      }
    >
      <ImportClient />
    </Suspense>
  );
}

function ImportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get("mode") === "fundraisers" ? "fundraisers" : "events";
  const requestedUrl = searchParams.get("url") || "";
  const [mode, setMode] = useState<ImportMode>(requestedMode);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [organizerId, setOrganizerId] = useState("");
  const [useImportedOrganizer, setUseImportedOrganizer] = useState(true);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sourceUrl, setSourceUrl] = useState(requestedUrl);
  const [urlLoading, setUrlLoading] = useState(false);

  useEffect(() => {
    setMode(requestedMode);
    setSourceUrl(requestedUrl);
    setPreviewRows([]);
    setError("");
    setMessage("");
  }, [requestedMode, requestedUrl]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (profile?.status === "suspended") {
        router.push("/login?suspended=1");
        return;
      }

      const { data: profiles, error: organizerError } = await supabase
        .from("organizers")
        .select("id, name")
        .eq("user_id", data.session.user.id)
        .order("created_at", { ascending: false });

      if (organizerError) {
        setError(organizerError.message);
      }

      const userOrganizers = profiles ?? [];
      setOrganizers(userOrganizers);
      setOrganizerId(userOrganizers[0]?.id || "");
      setChecking(false);
    });
  }, [router]);

  const validRows = useMemo(
    () => previewRows.filter((row) => row.errors.length === 0),
    [previewRows]
  );

  function resetPreview(nextMode: ImportMode) {
    setMode(nextMode);
    setPreviewRows([]);
    setError("");
    setMessage("");
  }

  async function handleFile(file: File | undefined) {
    setError("");
    setMessage("");

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file.");
      return;
    }

    const text = await file.text();
    const rows = parseCsv(text);
    const preview = buildPreviewRows(mode, rows, 2);

    setPreviewRows(preview);
    if (preview.length === 0) {
      setError("No rows found. Make sure your CSV has a header row and at least one data row.");
    }
  }

  async function handleUrlPreview() {
    setError("");
    setMessage("");
    setUrlLoading(true);

    try {
      const res = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, mode }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Could not import this URL.");
      }

      const row = payload.data as CsvRow;
      setPreviewRows(buildPreviewRows(mode, [row], 1));
      setMessage("URL preview loaded. Review the row before importing.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not import this URL.");
    } finally {
      setUrlLoading(false);
    }
  }

  function updatePreviewRow(rowNumber: number, field: string, value: string) {
    setPreviewRows((currentRows) => {
      const updatedRows = currentRows.map((row) =>
        row.rowNumber === rowNumber
          ? { ...row, data: { ...row.data, [field]: value } }
          : row
      );

      return buildPreviewRows(
        mode,
        updatedRows.map((row) => row.data),
        updatedRows[0]?.rowNumber ?? 1
      );
    });
  }

  async function importEvents(userId: string) {
    if (!useImportedOrganizer && !organizerId) {
      throw new Error("Select an organizer profile before importing events.");
    }

    const slugs = validRows.map((row) => generateSlug(row.data.title));
    const { data: existingEvents } = await supabase
      .from("events")
      .select("id, slug")
      .in("slug", slugs);

    const existingBySlug = new Map((existingEvents ?? []).map((event) => [event.slug, event.id]));
    const existingSlugs = new Set(existingBySlug.keys());
    const rowsToImport = validRows.filter((row) => !existingSlugs.has(generateSlug(row.data.title)));
    const rowsToRepair = validRows.filter((row) => existingSlugs.has(generateSlug(row.data.title)));

    const insertedEvents = [];

    for (const row of rowsToRepair) {
      const rowOrganizerId = useImportedOrganizer
        ? await findOrCreateImportedOrganizer(userId, row.data)
        : organizerId;
      const existingId = existingBySlug.get(generateSlug(row.data.title));

      if (!rowOrganizerId || !existingId) continue;

      const { error: repairError } = await supabase
        .from("events")
        .update({
          organizer_id: rowOrganizerId,
          source_organizer_name: row.data.source_organizer_name || null,
          source_organizer_url: row.data.source_organizer_url || null,
          source_organizer_description: row.data.source_organizer_description || null,
        })
        .eq("id", existingId);

      if (repairError && !isMissingOptionalImportColumn(repairError.message)) {
        throw new Error(`Row ${row.rowNumber}: ${repairError.message}`);
      }
    }

    for (const row of rowsToImport) {
      const rowOrganizerId = useImportedOrganizer
        ? await findOrCreateImportedOrganizer(userId, row.data)
        : organizerId;

      if (!rowOrganizerId) {
        throw new Error(`Row ${row.rowNumber}: Select an organizer or enter a source organizer name.`);
      }

      const slug = generateSlug(row.data.title);
      const eventPayload = {
        title: row.data.title,
        slug,
        description: row.data.description || "",
        category: row.data.category || "General",
        venue: row.data.venue || "",
        city: row.data.city || "",
        banner: row.data.banner || "",
        event_date: row.data.event_date,
        organizer_id: rowOrganizerId,
        user_id: userId,
        source_url: row.data.source_url || null,
        source_organizer_name: row.data.source_organizer_name || null,
        source_organizer_url: row.data.source_organizer_url || null,
        source_organizer_description: row.data.source_organizer_description || null,
        eventbrite_event_id: row.data.eventbrite_event_id || null,
      };

      let { data: event, error: eventError } = await supabase
        .from("events")
        .insert(eventPayload)
        .select()
        .single();

      if (eventError && isMissingOptionalImportColumn(eventError.message)) {
        const payloadWithoutSource = omitOptionalImportFields({
          ...eventPayload,
          description: descriptionWithSourceOrganizer(row.data),
        });
        const retry = await supabase
          .from("events")
          .insert(payloadWithoutSource)
          .select()
          .single();
        event = retry.data;
        eventError = retry.error;
      }

      if (eventError) throw new Error(`Row ${row.rowNumber}: ${eventError.message}`);
      if (!event) throw new Error(`Row ${row.rowNumber}: Event was not created.`);

      const primaryPrice = parseImportPrice(row.data.ticket1_price) ?? 0;
      const secondaryPrice = parseImportPrice(row.data.ticket2_price);
      const tickets = [
        {
          event_id: event.id,
          name: row.data.ticket1_name || "General Admission",
          price: primaryPrice,
          quantity: 100,
        },
        ...(secondaryPrice !== null || row.data.ticket2_name
          ? [
              {
                event_id: event.id,
                name: row.data.ticket2_name || "VIP Ticket",
                price: secondaryPrice ?? 0,
                quantity: 50,
              },
            ]
          : []),
      ];

      if (tickets.length > 0) {
        const { error: ticketError } = await supabase.from("tickets").insert(tickets);
        if (ticketError) throw new Error(`Row ${row.rowNumber} tickets: ${ticketError.message}`);
      }

      insertedEvents.push(event);
    }

    return { imported: insertedEvents.length, skipped: validRows.length - rowsToImport.length };
  }

  async function findOrCreateImportedOrganizer(userId: string, row: CsvRow) {
    const name = row.source_organizer_name?.trim();
    if (!name) return organizerId;

    const { data: existing, error: existingError } = await supabase
      .from("organizers")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();

    if (existingError) throw new Error(`${name}: ${existingError.message}`);
    if (existing?.id) return existing.id as string;

    const { data: organizer, error: insertError } = await supabase
      .from("organizers")
      .insert({
        user_id: userId,
        name,
        bio: row.source_organizer_description || "",
        website: row.source_organizer_url || "",
      })
      .select("id")
      .single();

    if (insertError) throw new Error(`${name}: ${insertError.message}`);
    return organizer?.id as string;
  }

  async function importFundraisers(userId: string) {
    if (!organizerId) {
      throw new Error("Create or select an organizer profile before importing fundraisers.");
    }

    const slugs = validRows.map((row) => generateSlug(row.data.title));
    const { data: existingFundraisers } = await supabase
      .from("fundraisers")
      .select("slug")
      .in("slug", slugs);

    const existingSlugs = new Set((existingFundraisers ?? []).map((fundraiser) => fundraiser.slug));
    const rowsToImport = validRows.filter((row) => !existingSlugs.has(generateSlug(row.data.title)));

    const payload = rowsToImport.map((row) => ({
      title: row.data.title,
      slug: generateSlug(row.data.title),
      story: row.data.story,
      goal: Number(row.data.goal),
      raised: 0,
      organizer: row.data.organizer || "",
      banner: row.data.banner || "",
      video_url: row.data.video_url || null,
      user_id: userId,
      organizer_id: organizerId,
      source_url: row.data.source_url || null,
      category: row.data.category || "Other",
    }));

    if (payload.length > 0) {
      const { error: insertError } = await supabase.from("fundraisers").insert(payload);
      if (insertError && isMissingOptionalImportColumn(insertError.message)) {
        const payloadWithoutSource = payload.map((row) => omitOptionalImportFields(row));
        const { error: retryError } = await supabase.from("fundraisers").insert(payloadWithoutSource);
        if (retryError) throw new Error(retryError.message);
      } else if (insertError) {
        throw new Error(insertError.message);
      }
    }

    return { imported: payload.length, skipped: validRows.length - rowsToImport.length };
  }

  async function handleImport() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
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

      if (validRows.length === 0) {
        throw new Error("There are no valid rows to import.");
      }

      const result =
        mode === "events"
          ? await importEvents(session.user.id)
          : await importFundraisers(session.user.id);

      setMessage(`Imported ${result.imported} ${mode}. Skipped ${result.skipped} duplicate row${result.skipped === 1 ? "" : "s"}.`);
      setPreviewRows([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
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
            <p className="text-base font-black uppercase tracking-wide text-orange-600">Import</p>
            <h1 className="mt-2 text-5xl font-black">Import Events & Fundraisers</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
              Upload a CSV, preview the rows, fix any errors, then save them into your account.
            </p>
          </div>
          <Link href="/dashboard" className="text-base font-black text-orange-600 hover:text-orange-700">
            Back to dashboard
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <label className="mb-3 block text-sm font-black uppercase tracking-wide text-zinc-500">
                Import type
              </label>
              <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
                {(["events", "fundraisers"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => resetPreview(item)}
                    className={`rounded-lg px-4 py-3 text-base font-black capitalize transition ${
                      mode === item ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {mode === "events" && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <label className="mb-3 block text-sm font-black uppercase tracking-wide text-zinc-500">
                  Organization profile
                </label>
                <label className="mb-4 flex items-start gap-3 rounded-xl bg-orange-50 p-4">
                  <input
                    type="checkbox"
                    checked={useImportedOrganizer}
                    onChange={(event) => setUseImportedOrganizer(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-orange-600"
                  />
                  <span>
                    <span className="block font-black text-zinc-950">Use imported organizer</span>
                    <span className="mt-1 block text-sm leading-5 text-zinc-600">
                      Create or reuse the organizer found on the source page.
                    </span>
                  </span>
                </label>
                <select
                  value={organizerId}
                  onChange={(event) => setOrganizerId(event.target.value)}
                  disabled={useImportedOrganizer}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base font-bold outline-none focus:border-orange-500 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  {organizers.length === 0 ? (
                    <option value="">No organizer profiles yet</option>
                  ) : (
                    organizers.map((organizer) => (
                      <option key={organizer.id} value={organizer.id}>
                        {organizer.name}
                      </option>
                    ))
                  )}
                </select>
                {organizers.length === 0 && (
                  <Link href="/create-organizer" className="mt-3 inline-block font-bold text-orange-600">
                    Create an organizer profile
                  </Link>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <label className="mb-3 block text-sm font-black uppercase tracking-wide text-zinc-500">
                CSV file
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => handleFile(event.target.files?.[0])}
                className="block w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-base file:mr-4 file:rounded-full file:border-0 file:bg-orange-600 file:px-4 file:py-2 file:font-black file:text-white"
              />
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <label className="mb-3 block text-sm font-black uppercase tracking-wide text-zinc-500">
                Import from URL
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://example.com/event-page"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
              />
              <button
                onClick={handleUrlPreview}
                disabled={urlLoading || !sourceUrl.trim()}
                className="mt-3 w-full rounded-xl bg-zinc-950 px-5 py-3 text-base font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {urlLoading ? "Reading page..." : "Preview URL"}
              </button>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Works best on pages with structured event metadata or Open Graph tags.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">CSV template</h2>
              <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-sm leading-6 text-white">
                {exampleCsv(mode)}
              </pre>
            </div>
          </aside>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-3xl font-black">Preview</h2>
                <p className="mt-1 text-zinc-500">
                  {previewRows.length} rows loaded. {validRows.length} valid.
                </p>
              </div>
              <button
                onClick={handleImport}
                disabled={loading || validRows.length === 0 || (mode === "events" && !useImportedOrganizer && !organizerId) || (mode === "fundraisers" && !organizerId)}
                className="rounded-xl bg-orange-600 px-6 py-4 text-base font-black text-white transition hover:bg-orange-700 disabled:bg-orange-300"
              >
                {loading ? "Importing..." : `Import ${validRows.length} ${mode}`}
              </button>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-5 py-4 font-semibold text-green-700">
                {message}
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black">Review first row</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      URL imports often need a date or goal added before they can be saved.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-zinc-600">
                    Row {previewRows[0].rowNumber}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                      Title
                    </span>
                    <input
                      value={previewRows[0].data.title || ""}
                      onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "title", event.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                    />
                  </label>

                  {mode === "events" ? (
                    <label className="block">
                      <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                        Event date
                      </span>
                      <input
                        value={previewRows[0].data.event_date || ""}
                        onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "event_date", event.target.value)}
                        placeholder="2026-08-20T19:00"
                        className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                      />
                    </label>
                  ) : (
                    <label className="block">
                      <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                        Goal
                      </span>
                      <input
                        value={previewRows[0].data.goal || ""}
                        onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "goal", event.target.value)}
                        placeholder="20000"
                        className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                      />
                    </label>
                  )}

                  {mode === "events" ? (
                    <>
                      <label className="block">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          Ticket name
                        </span>
                        <input
                          value={previewRows[0].data.ticket1_name || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "ticket1_name", event.target.value)}
                          placeholder="General Admission"
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          Ticket price
                        </span>
                        <input
                          value={previewRows[0].data.ticket1_price || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "ticket1_price", event.target.value)}
                          placeholder="25"
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          Venue
                        </span>
                        <input
                          value={previewRows[0].data.venue || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "venue", event.target.value)}
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          City
                        </span>
                        <input
                          value={previewRows[0].data.city || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "city", event.target.value)}
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          Source organizer
                        </span>
                        <input
                          value={previewRows[0].data.source_organizer_name || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "source_organizer_name", event.target.value)}
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          Source organizer URL
                        </span>
                        <input
                          value={previewRows[0].data.source_organizer_url || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "source_organizer_url", event.target.value)}
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                          Source organizer bio
                        </span>
                        <textarea
                          value={previewRows[0].data.source_organizer_description || ""}
                          onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "source_organizer_description", event.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="block md:col-span-2">
                      <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                        Organization
                      </span>
                      <input
                        value={previewRows[0].data.organizer || ""}
                        onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "organizer", event.target.value)}
                        className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                      />
                    </label>
                  )}

                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                      {mode === "events" ? "Description" : "Story"}
                    </span>
                    <textarea
                      value={previewRows[0].data[mode === "events" ? "description" : "story"] || ""}
                      onChange={(event) =>
                        updatePreviewRow(
                          previewRows[0].rowNumber,
                          mode === "events" ? "description" : "story",
                          event.target.value
                        )
                      }
                      rows={4}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-black uppercase tracking-wide text-zinc-500">
                      Banner image URL
                    </span>
                    <input
                      value={previewRows[0].data.banner || ""}
                      onChange={(event) => updatePreviewRow(previewRows[0].rowNumber, "banner", event.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-orange-500"
                    />
                  </label>
                </div>
              </div>
            )}

            {previewRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-8 py-20 text-center">
                <h3 className="text-2xl font-black">Upload a CSV to preview imports</h3>
                <p className="mx-auto mt-3 max-w-lg text-lg leading-8 text-zinc-500">
                  Use the template on the left. You can import events with ticket prices or fundraisers with goals.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-zinc-200 px-4 py-3 font-black">Row</th>
                      <th className="border-b border-zinc-200 px-4 py-3 font-black">Title</th>
                      <th className="border-b border-zinc-200 px-4 py-3 font-black">
                        {mode === "events" ? "Date" : "Goal"}
                      </th>
                      <th className="border-b border-zinc-200 px-4 py-3 font-black">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="border-b border-zinc-100 px-4 py-4 font-bold">{row.rowNumber}</td>
                        <td className="border-b border-zinc-100 px-4 py-4">
                          <p className="font-black">{row.data.title || "Untitled"}</p>
                          <p className="mt-1 text-zinc-500">
                            {mode === "events"
                              ? row.data.city || row.data.venue || "Location TBA"
                              : row.data.organizer || "Organization TBA"}
                          </p>
                        </td>
                        <td className="border-b border-zinc-100 px-4 py-4 font-semibold">
                          {mode === "events" ? row.data.event_date || "Missing" : row.data.goal || "Missing"}
                        </td>
                        <td className="border-b border-zinc-100 px-4 py-4">
                          {row.errors.length === 0 ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 font-black text-green-700">
                              Ready
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {row.errors.map((rowError) => (
                                <p key={rowError} className="font-semibold text-red-600">
                                  {rowError}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
