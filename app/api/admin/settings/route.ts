/**
 * app/api/admin/settings/route.ts
 * GET  — fetch allowlisted platform_settings rows.
 * POST — upsert allowlisted rows sent in the request body.
 * Admin-only: checks isAdmin() before any DB operation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { PLATFORM_SETTING_KEYS, PLATFORM_SETTING_KEY_SET } from "@/types/platform-settings";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("key, value, updated_at")
    .in("key", PLATFORM_SETTING_KEYS)
    .order("key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  const body = (await req.json()) as { settings?: { key: string; value: string }[] };

  if (!Array.isArray(body.settings) || body.settings.length === 0) {
    return NextResponse.json({ error: "No settings provided." }, { status: 400 });
  }

  const invalid = body.settings.filter((s) => !PLATFORM_SETTING_KEY_SET.has(s.key));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid setting keys: ${invalid.map((s) => s.key).join(", ")}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const rows = body.settings.map((s) => ({
    key: s.key,
    value: String(s.value),
    updated_at: now,
    updated_by: user?.id ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("platform_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: rows.length });
}
