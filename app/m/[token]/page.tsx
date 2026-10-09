import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { CameraOff } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { isMemoryTokenFormat } from "@/lib/memories/tokens";
import MemoryUploadClient from "./MemoryUploadClient";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Event Memories | Aldriva",
    description: "Share your event photos with the organizer.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function MemoryUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Pure token-shape validation — no I/O, safe to prerender statically.
  if (!isMemoryTokenFormat(token)) {
    return <InvalidMemoryView message="This photo link is invalid or malformed." />;
  }

  return (
    <Suspense fallback={<MemoryLoadingView />}>
      <MemoryLoader token={token} />
    </Suspense>
  );
}

/**
 * Per-request loader (same shell/slot pattern as the invitation page):
 * the token, active flag, and approval mode revalidate on every hit.
 * Rate-limited per IP, fail-open. Invalid, revoked, and disabled tokens
 * share one neutral view that reveals nothing about the event.
 */
async function MemoryLoader({ token }: { token: string }) {
  await connection();

  try {
    const ip = clientIp({ headers: await headers() } as unknown as Request);
    const gate = await checkRateLimit("memoryView", `ip:${ip}`);
    if (!gate.allowed) return <InvalidMemoryView message="Too many requests. Please try again shortly." />;
  } catch {
    /* fail open */
  }

  const admin = createSupabaseAdmin();
  const { data: settings } = await admin
    .from("event_memory_settings")
    .select("event_id, is_active, require_approval")
    .eq("upload_token", token)
    .maybeSingle();
  const row = settings as {
    event_id?: string;
    is_active?: boolean;
    require_approval?: boolean;
  } | null;
  if (!row?.event_id || row.is_active !== true) {
    return <InvalidMemoryView message="This photo link is invalid or has expired." />;
  }

  const { data: event } = await admin
    .from("events")
    .select("title, event_date, venue, city")
    .eq("id", row.event_id)
    .maybeSingle();
  const ev = (event ?? {}) as {
    title?: string | null;
    event_date?: string | null;
    venue?: string | null;
    city?: string | null;
  };

  return (
    <MemoryUploadClient
      token={token}
      eventTitle={ev.title || "Event memories"}
      eventMeta={[ev.venue, ev.city].filter(Boolean).join(" · ") || null}
      requireApproval={row.require_approval !== false}
    />
  );
}

function MemoryLoadingView() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 h-16 w-16 animate-pulse rounded-xl bg-zinc-100" />
        <div className="mx-auto h-5 w-40 animate-pulse rounded-lg bg-zinc-100" />
        <div className="mx-auto mt-3 h-3.5 w-56 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    </main>
  );
}

function InvalidMemoryView({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
          <CameraOff size={28} />
        </div>
        <h1 className="text-xl font-black text-zinc-900">Photo link unavailable</h1>
        <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-500">{message}</p>
      </div>
    </main>
  );
}
