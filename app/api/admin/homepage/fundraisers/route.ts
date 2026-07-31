/**
 * app/api/admin/homepage/fundraisers/route.ts
 * GET   — search all fundraisers or fetch featured fundraisers (ordered).
 * PATCH — update is_homepage_featured and homepage_position.
 * Admin-only: checks isAdmin().
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (q) {
    // Search for fundraisers matching query
    const { data, error } = await supabaseAdmin
      .from("fundraisers")
      .select("id, title, slug, is_homepage_featured, homepage_position, goal, raised")
      .ilike("title", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ fundraisers: data ?? [] });
  } else {
    // Fetch currently featured fundraisers sorted by position
    const { data, error } = await supabaseAdmin
      .from("fundraisers")
      .select("id, title, slug, is_homepage_featured, homepage_position, goal, raised")
      .eq("is_homepage_featured", true)
      .order("homepage_position", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ fundraisers: data ?? [] });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id, is_homepage_featured, homepage_position } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Fundraiser ID is required." }, { status: 400 });
    }

    const update: Record<string, any> = {};
    if (is_homepage_featured !== undefined) update.is_homepage_featured = !!is_homepage_featured;
    if (homepage_position !== undefined) update.homepage_position = Number(homepage_position);

    const { error } = await supabaseAdmin
      .from("fundraisers")
      .update(update)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/", "page");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
