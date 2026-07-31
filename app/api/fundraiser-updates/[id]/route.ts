import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const { data: update, error: updateError } = await supabaseAdmin
    .from("fundraiser_updates")
    .select("id, fundraiser_id")
    .eq("id", id)
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!update) {
    return NextResponse.json({ error: "You do not own this update." }, { status: 403 });
  }

  const { data: fundraiser, error: fundraiserError } = await supabaseAdmin
    .from("fundraisers")
    .select("id, organizer_id")
    .eq("id", update.fundraiser_id)
    .maybeSingle();

  if (fundraiserError) {
    return NextResponse.json({ error: fundraiserError.message }, { status: 500 });
  }

  if (!fundraiser?.organizer_id) {
    return NextResponse.json({ error: "You do not own this update." }, { status: 403 });
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
    return NextResponse.json({ error: "You do not own this update." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("fundraiser_updates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
