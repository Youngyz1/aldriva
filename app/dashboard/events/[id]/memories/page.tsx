import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getMemoryStorageDriverFor, type MemoryStorageProvider } from "@/lib/memories/storage";
import { buildMemoryUploadUrl } from "@/lib/invitation-url";
import MemoriesClient, { type MemoryPhotoView } from "./MemoriesClient";

export const metadata = {
  title: "Memories | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

/** Signed view URLs for the grid. Short-lived (5 min): minted per render. */
const VIEW_URL_TTL_SECONDS = 300;

export default async function EventMemoriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canManage = await hasEventOrOrganizerAccess(ctx.user.id, eventId, [
    "event_manager",
  ]);
  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can manage event memories.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title")
    .eq("id", eventId)
    .single();
  if (!event) redirect("/dashboard/events");

  const [{ data: settings }, { data: photos }] = await Promise.all([
    admin
      .from("event_memory_settings")
      .select("upload_token, is_active, require_approval")
      .eq("event_id", eventId)
      .maybeSingle(),
    admin
      .from("event_memories")
      .select(
        "id, storage_provider, object_key, content_type, size_bytes, width, height, status, guest_label, report_count, created_at"
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const settingRow = settings as {
    upload_token?: string;
    is_active?: boolean;
    require_approval?: boolean;
  } | null;

  const views: MemoryPhotoView[] = await Promise.all(
    ((photos ?? []) as {
      id: string;
      storage_provider: MemoryStorageProvider;
      object_key: string;
      content_type: string;
      size_bytes: number;
      width: number | null;
      height: number | null;
      status: string;
      guest_label: string | null;
      report_count: number;
      created_at: string;
    }[]).map(async (p) => {
      let viewUrl: string | null = null;
      try {
        viewUrl = await getMemoryStorageDriverFor(
          p.storage_provider === "r2" ? "r2" : "supabase"
        ).signGet(p.object_key, VIEW_URL_TTL_SECONDS);
      } catch {
        viewUrl = null;
      }
      return {
        id: p.id,
        viewUrl,
        contentType: p.content_type,
        sizeBytes: p.size_bytes,
        width: p.width,
        height: p.height,
        status: p.status,
        guestLabel: p.guest_label,
        reportCount: p.report_count ?? 0,
        createdAt: p.created_at,
      };
    })
  );

  return (
    <MemoriesClient
      eventId={eventId}
      eventTitle={(event as { title?: string | null } | null)?.title || "Event"}
      uploadsEnabled={settingRow?.is_active === true}
      requireApproval={settingRow?.require_approval !== false}
      uploadUrl={
        settingRow?.is_active === true && settingRow.upload_token
          ? buildMemoryUploadUrl(settingRow.upload_token)
          : null
      }
      photos={views}
    />
  );
}
