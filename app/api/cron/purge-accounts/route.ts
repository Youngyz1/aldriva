import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/dashboard-context";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  try {
    // 1. Purge profiles whose purge_at has passed
    const { data: profilesToDelete, error: profilesErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .not("purge_at", "is", null)
      .lte("purge_at", now);

    if (profilesErr) {
      throw new Error(`Failed to query profiles: ${profilesErr.message}`);
    }

    const profileIds = (profilesToDelete ?? []).map((p) => p.id);
    console.log(`[PurgeAccounts Cron] Found ${profileIds.length} profile(s) to purge.`);

    if (profileIds.length === 0) {
      return NextResponse.json({ success: true, purged: 0 });
    }

    let purgedCount = 0;

    for (const profileId of profileIds) {
      try {
        // 2a. Anonymise profile data (wipe PII, keep the row for FK integrity)
        await supabaseAdmin
          .from("profiles")
          .update({
            full_name: "[deleted]",
            avatar_url: null,
            bio: null,
            location: null,
            website: null,
            phone: null,
            status: "purged",
            // keep deleted_at so the row is clearly marked, clear purge_at
            purge_at: null,
          })
          .eq("id", profileId);

        // 2b. Fetch all organizers owned by this user
        const { data: organizers } = await supabaseAdmin
          .from("organizers")
          .select("id")
          .eq("user_id", profileId);

        const organizerIds = (organizers ?? []).map((o) => o.id);

        if (organizerIds.length > 0) {
          // 2c. Anonymise events
          await supabaseAdmin
            .from("events")
            .update({
              title: "[deleted]",
              description: null,
              image_url: null,
              purge_at: null,
            })
            .in("organizer_id", organizerIds);

          // 2d. Anonymise fundraisers
          await supabaseAdmin
            .from("fundraisers")
            .update({
              title: "[deleted]",
              description: null,
              image_url: null,
              purge_at: null,
            })
            .in("organizer_id", organizerIds);

          // 2e. Anonymise organizers
          await supabaseAdmin
            .from("organizers")
            .update({
              name: "[deleted]",
              bio: null,
              photo: null,
              banner: null,
              purge_at: null,
            })
            .eq("user_id", profileId);
        }

        // 2f. Delete the auth user from Supabase Auth (this is the hard delete in Auth only)
        await supabaseAdmin.auth.admin.deleteUser(profileId);

        purgedCount++;
        console.log(`[PurgeAccounts Cron] Purged user ${profileId}`);
      } catch (userErr: unknown) {
        const msg = userErr instanceof Error ? userErr.message : String(userErr);
        console.error(`[PurgeAccounts Cron] Failed to purge user ${profileId}: ${msg}`);
        // Continue with remaining users; don't abort the entire job
      }
    }

    return NextResponse.json({ success: true, purged: purgedCount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PurgeAccounts Cron] Fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
