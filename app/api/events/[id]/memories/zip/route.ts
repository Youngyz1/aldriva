import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getMemoryStorageDriverFor, type MemoryStorageProvider } from "@/lib/memories/storage";
import { streamStoredZip, type ZipInputFile } from "@/lib/memories/zip";

/** Hard caps: the archive streams, but never grows without bound. */
const MAX_ZIP_FILES = 500;
const MAX_ZIP_BYTES = 512 * 1024 * 1024;

const STATUS_FILTERS = ["approved", "pending", "rejected", "all"] as const;

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function safeArchiveName(index: number, id: string, contentType: string): string {
  return `memory-${String(index).padStart(3, "0")}-${id.slice(0, 8)}.${extensionFor(contentType)}`;
}

/**
 * GET /api/events/[id]/memories/zip?status=approved
 * Streams a stored-method ZIP of organizer-visible photos. Files stream
 * one at a time (each bounded by the 15 MB photo cap) — the archive as a
 * whole is never buffered in memory. Pre-checked caps answer 413 early.
 */
export const maxDuration = 60;
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || "approved";
  if (!(STATUS_FILTERS as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 422 });
  }

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("slug, title")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  let query = admin
    .from("event_memories")
    .select("id, storage_provider, object_key, content_type, size_bytes")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(MAX_ZIP_FILES + 1);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    console.error("[memories/zip] list failed:", error.message);
    return NextResponse.json({ error: "Could not list photos." }, { status: 500 });
  }

  const rows = ((data ?? []) as {
    id: string;
    storage_provider: MemoryStorageProvider;
    object_key: string;
    content_type: string;
    size_bytes: number;
  }[]).filter((r) => r.size_bytes > 0);

  if (rows.length > MAX_ZIP_FILES) {
    return NextResponse.json(
      { error: `Too many photos for one download (over ${MAX_ZIP_FILES}). Narrow the status filter.` },
      { status: 413 }
    );
  }
  const totalBytes = rows.reduce((sum, r) => sum + r.size_bytes, 0);
  if (totalBytes > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: "This selection exceeds the 512 MB download cap. Narrow the status filter." },
      { status: 413 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No photos match this filter." }, { status: 404 });
  }

  const files: ZipInputFile[] = rows.map((row, index) => {
    const provider = row.storage_provider === "r2" ? "r2" : "supabase";
    const driver = getMemoryStorageDriverFor(provider);
    const key = row.object_key;
    const size = row.size_bytes;
    return {
      name: safeArchiveName(index + 1, row.id, row.content_type),
      size,
      body: (async function* () {
        const { body } = await driver.getBytes(key, size);
        yield body;
      })(),
    };
  });

  const slug = ((event as { slug?: string | null }).slug || "memories").replace(/[^a-z0-9-]+/gi, "-");
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamStoredZip(files)) controller.enqueue(chunk);
        controller.close();
      } catch (err) {
        console.error("[memories/zip] stream aborted:", err instanceof Error ? err.message : err);
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-${status}-memories.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
