/**
 * app/api/admin/homepage/categories/route.ts
 * GET    — list all homepage categories (ordered).
 * POST   — create a new homepage category.
 * PATCH  — update a category (name, icon, position, is_visible) or reorder multiple.
 * DELETE — delete a homepage category.
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

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("homepage_categories")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { name, icon, position, is_visible } = await req.json();

    if (!name || !icon) {
      return NextResponse.json({ error: "Name and Icon are required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("homepage_categories")
      .insert([
        {
          name: name.trim(),
          icon: icon.trim(),
          position: position !== undefined ? Number(position) : 0,
          is_visible: is_visible !== undefined ? !!is_visible : true,
        },
      ])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidatePath("/", "page");
    revalidatePath("/events", "page");
    return NextResponse.json({ success: true, category: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Support batch reordering
    if (Array.isArray(body.reorder)) {
      const updates = body.reorder.map(async (item: { id: string; position: number }) => {
        return supabaseAdmin
          .from("homepage_categories")
          .update({ position: Number(item.position) })
          .eq("id", item.id);
      });

      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed) {
        return NextResponse.json({ error: failed.error?.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Otherwise, update a single category
    revalidatePath("/", "page");
    revalidatePath("/events", "page");
    const { id, name, icon, position, is_visible } = body;

    if (!id) {
      return NextResponse.json({ error: "Category ID is required." }, { status: 400 });
    }

    const update: Record<string, any> = {};
    if (name !== undefined) update.name = name.trim();
    if (icon !== undefined) update.icon = icon.trim();
    if (position !== undefined) update.position = Number(position);
    if (is_visible !== undefined) update.is_visible = !!is_visible;

    const { data, error } = await supabaseAdmin
      .from("homepage_categories")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Category ID is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("homepage_categories")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/", "page");
  revalidatePath("/events", "page");
  return NextResponse.json({ success: true });
}
