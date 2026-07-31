/**
 * app/api/admin/homepage/sponsors/route.ts
 * GET    — list all sponsors ordered by position.
 * POST   — create a sponsor.
 * PATCH  — update one or batch-reorder.
 * DELETE — delete by ?id=
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("homepage_sponsors")
    .select("*")
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sponsors: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { name, logo_url, website_url, position, is_visible } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Sponsor name is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("homepage_sponsors")
      .insert([{ name: name.trim(), logo_url: (logo_url ?? "").trim(), website_url: (website_url ?? "").trim(), position: Number(position ?? 0), is_visible: is_visible !== false }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/", "page");
    return NextResponse.json({ success: true, sponsor: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();

    if (Array.isArray(body.reorder)) {
      await Promise.all(
        body.reorder.map((item: { id: string; position: number }) =>
          supabaseAdmin.from("homepage_sponsors").update({ position: Number(item.position) }).eq("id", item.id)
        )
      );
      return NextResponse.json({ success: true });
    }

    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (fields.name        !== undefined) update.name        = String(fields.name).trim();
    if (fields.logo_url    !== undefined) update.logo_url    = String(fields.logo_url).trim();
    if (fields.website_url !== undefined) update.website_url = String(fields.website_url).trim();
    if (fields.position    !== undefined) update.position    = Number(fields.position);
    if (fields.is_visible  !== undefined) update.is_visible  = Boolean(fields.is_visible);

    const { data, error } = await supabaseAdmin
      .from("homepage_sponsors")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/", "page");
    return NextResponse.json({ success: true, sponsor: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

  const { error } = await supabaseAdmin.from("homepage_sponsors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/", "page");
  return NextResponse.json({ success: true });
}
