import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/dashboard-context";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch user profile to verify pending deletion
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("deleted_at, purge_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile || !profile.deleted_at || !profile.purge_at) {
    return NextResponse.json({ error: "No account recovery pending." }, { status: 400 });
  }

  const purgeAt = new Date(profile.purge_at);
  if (purgeAt <= new Date()) {
    return NextResponse.json({ error: "Account recovery window has expired." }, { status: 400 });
  }

  // Clear deactivation fields on profile
  const { error: updateProfileError } = await supabaseAdmin
    .from("profiles")
    .update({
      deleted_at: null,
      purge_at: null,
      status: "active",
    })
    .eq("id", user.id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
  }

  // Fetch organizers owned by user
  const { data: organizers } = await supabaseAdmin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id);

  const organizerIds = (organizers ?? []).map((o) => o.id);

  if (organizerIds.length > 0) {
    // Clear deactivation fields on events
    await supabaseAdmin
      .from("events")
      .update({ deleted_at: null, purge_at: null })
      .in("organizer_id", organizerIds);

    // Clear deactivation fields on fundraisers
    await supabaseAdmin
      .from("fundraisers")
      .update({ deleted_at: null, purge_at: null })
      .in("organizer_id", organizerIds);

    // Clear deactivation fields on organizers
    await supabaseAdmin
      .from("organizers")
      .update({ deleted_at: null, purge_at: null })
      .eq("user_id", user.id);
  }

  return NextResponse.json({ success: true });
}
