import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const fundraiserId = cleanText(payload?.fundraiser_id);
  const title = cleanText(payload?.title);
  const content = cleanText(payload?.content);

  if (!uuidPattern.test(fundraiserId)) {
    return NextResponse.json({ error: "Invalid fundraiser." }, { status: 400 });
  }

  if (content.length < 20) {
    return NextResponse.json(
      { error: "Update content must be at least 20 characters." },
      { status: 400 }
    );
  }

  const { data: fundraiser, error: fundraiserError } = await supabaseAdmin
    .from("fundraisers")
    .select("id, organizer_id")
    .eq("id", fundraiserId)
    .maybeSingle();

  if (fundraiserError) {
    return NextResponse.json({ error: fundraiserError.message }, { status: 500 });
  }

  if (!fundraiser?.organizer_id) {
    return NextResponse.json({ error: "You do not own this fundraiser." }, { status: 403 });
  }

  const { data: organizer, error: organizerError } = await supabaseAdmin
    .from("organizers")
    .select("id")
    .eq("id", fundraiser.organizer_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    return NextResponse.json({ error: organizerError.message }, { status: 500 });
  }

  if (!organizer) {
    return NextResponse.json({ error: "You do not own this fundraiser." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("fundraiser_updates")
    .insert({
      fundraiser_id: fundraiserId,
      organizer_id: fundraiser.organizer_id,
      title: title || null,
      content,
    })
    .select("id, title, content, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ update: data }, { status: 201 });
}
