/**
 * app/api/admin/homepage/settings/route.ts
 * POST — upsert homepage CMS settings (hero + SEO keys only).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { HOMEPAGE_SETTING_KEYS, parseHeroImages } from "@/lib/homepage-hero";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HOMEPAGE_KEY_SET = new Set<string>(HOMEPAGE_SETTING_KEYS);

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  const body = (await req.json()) as { settings?: { key: string; value: string }[] };

  if (!Array.isArray(body.settings) || body.settings.length === 0) {
    return NextResponse.json({ error: "No settings provided." }, { status: 400 });
  }

  const invalid = body.settings.filter((s) => !HOMEPAGE_KEY_SET.has(s.key));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid homepage setting keys: ${invalid.map((s) => s.key).join(", ")}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const rows = body.settings.map((s) => ({
    key: s.key,
    // The hero photo-fan list is structured JSON — sanitize/cap it rather than
    // storing whatever the client sent verbatim.
    value:
      s.key === "fundraisers_hero_images"
        ? JSON.stringify(parseHeroImages(String(s.value)))
        : String(s.value),
    updated_at: now,
    updated_by: user?.id ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("platform_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bust the cached homepage and events page so changes are visible immediately
  revalidatePath("/", "page");
  revalidatePath("/events", "page");

  return NextResponse.json({ success: true, count: rows.length });
}
