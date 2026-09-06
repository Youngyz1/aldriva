import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const type = searchParams.get("type") || "all";

  if (!q) {
    return NextResponse.json({ entities: [] });
  }

  const pattern = `%${q}%`;
  const results: Array<{
    type: "fundraiser" | "event" | "organization";
    id: string;
    title: string;
    slug: string;
    subtitle?: string;
    imageUrl?: string | null;
  }> = [];

  try {
    const promises: Promise<void>[] = [];

    // 1. Search Fundraisers
    if (type === "all" || type === "fundraiser") {
      promises.push(
        (async () => {
          const { data } = await supabase
            .from("fundraisers")
            .select("id, title, slug, banner, category")
            .is("deleted_at", null)
            .ilike("title", pattern)
            .limit(6);

          if (data) {
            data.forEach((f) => {
              results.push({
                type: "fundraiser",
                id: f.id,
                title: f.title,
                slug: f.slug,
                subtitle: f.category || "Fundraising Campaign",
                imageUrl: f.banner,
              });
            });
          }
        })()
      );
    }

    // 2. Search Events
    if (type === "all" || type === "event") {
      promises.push(
        (async () => {
          const { data } = await supabase
            .from("events")
            .select("id, title, slug, banner, city, venue, event_date")
            .eq("visibility", "public")
            .eq("status", "approved")
            .is("deleted_at", null)
            .ilike("title", pattern)
            .limit(6);

          if (data) {
            data.forEach((e) => {
              const locationStr = [e.venue, e.city].filter(Boolean).join(", ");
              results.push({
                type: "event",
                id: e.id,
                title: e.title,
                slug: e.slug,
                subtitle: locationStr || "Upcoming Event",
                imageUrl: e.banner,
              });
            });
          }
        })()
      );
    }

    // 3. Search Organizations
    if (type === "all" || type === "organization") {
      promises.push(
        (async () => {
          const { data } = await supabase
            .from("organizers")
            .select("id, name, slug, photo, banner, category")
            .eq("visibility", "public")
            .in("status", ["pending", "verified"])
            .is("deleted_at", null)
            .ilike("name", pattern)
            .limit(6);

          if (data) {
            data.forEach((o) => {
              results.push({
                type: "organization",
                id: o.id,
                title: o.name,
                slug: o.slug,
                subtitle: o.category || "Organization",
                imageUrl: o.photo || o.banner,
              });
            });
          }
        })()
      );
    }

    await Promise.all(promises);
    return NextResponse.json({ entities: results });
  } catch (err: unknown) {
    console.error("Entity search error:", err);
    return NextResponse.json({ error: "Failed to search entities" }, { status: 500 });
  }
}
