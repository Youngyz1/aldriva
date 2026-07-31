/**
 * app/api/admin/homepage/hero-images/candidates/route.ts
 * GET — fundraisers whose banner resolves to a real, allowed image, for the
 * admin hero photo-fan picker. Applies the same normalizeImageUrl gate used
 * across the app (drops null / video / disallowed-host banners); the client
 * additionally onError-drops thumbnails that 403 or die, so only genuinely
 * loadable photos can be picked. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/auth";
import { normalizeImageUrl } from "@/lib/image-url";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim();

  let query = supabaseAdmin
    .from("fundraisers")
    .select("id, title, slug, banner, image_url")
    .order("created_at", { ascending: false })
    .limit(60);

  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? [])
    .map((row) => ({
      id: row.id as string,
      title: row.title as string,
      slug: row.slug as string,
      image: normalizeImageUrl(row.image_url || row.banner, ""),
    }))
    .filter((c) => c.image.length > 0)
    .slice(0, 40);

  return NextResponse.json({ candidates });
}
