import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/dashboard-context";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Hard-purges accounts whose 14-day deletion grace period has elapsed.
 *
 * Every write here MUST have its `error` inspected. `supabase-js` resolves with
 * `{ data, error }` rather than throwing, so an unchecked write fails silently
 * and the surrounding try/catch never fires. That is exactly how the previous
 * version of this route reported "Purged user X" while erasing nothing: three
 * of its four writes targeted columns that do not exist (`profiles.full_name`,
 * `events.image_url`, `fundraisers.description`) and returned HTTP 400, and a
 * fourth set `profiles.status = 'purged'`, which violates `profiles_status_check`.
 *
 * If you add a write to this file, destructure `error` and throw on it.
 *
 * Aldriva-only content types (articles, businesses, products) are NOT scrubbed
 * here on purpose: their owner_id FKs are `REFERENCES auth.users ON DELETE
 * CASCADE`, so the auth-user deletion in step 2f removes those rows entirely —
 * a stronger guarantee than anonymisation.
 */

/** Throws with context if a Supabase write failed, so the caller can count it as unpurged. */
function assertOk(step: string, error: { message: string } | null) {
  if (error) throw new Error(`${step}: ${error.message}`);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  try {
    // 1. Find profiles whose purge_at has passed
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
      return NextResponse.json({ success: true, purged: 0, failed: 0 });
    }

    let purgedCount = 0;
    const failures: string[] = [];

    for (const profileId of profileIds) {
      try {
        // 2a. Anonymise the profile (keep the row so FKs stay intact).
        //     account_info / preferences / privacy_settings are NOT NULL jsonb
        //     defaulting to '{}' — they must be emptied, not nulled.
        //     'purged' is an allowed status only because migration_53 added it
        //     to profiles_status_check.
        const { error: profileErr } = await supabaseAdmin
          .from("profiles")
          .update({
            display_name: "[deleted]",
            avatar_url: null,
            profile_photo: null,
            account_info: {},
            preferences: {},
            privacy_settings: {},
            status: "purged",
            // deleted_at is kept as the tombstone; purge_at is cleared so this
            // row is not re-selected on every subsequent nightly run.
            purge_at: null,
          })
          .eq("id", profileId);
        assertOk("profiles", profileErr);

        // 2b. Organizers owned by this user
        const { data: organizers, error: orgFetchErr } = await supabaseAdmin
          .from("organizers")
          .select("id")
          .eq("user_id", profileId);
        assertOk("organizers.select", orgFetchErr);

        const organizerIds = (organizers ?? []).map((o) => o.id);

        if (organizerIds.length > 0) {
          // 2c. Anonymise events (column is `banner`, not `image_url`)
          const { error: eventsErr } = await supabaseAdmin
            .from("events")
            .update({
              title: "[deleted]",
              description: null,
              banner: null,
              purge_at: null,
            })
            .in("organizer_id", organizerIds);
          assertOk("events", eventsErr);

          // 2d. Anonymise fundraisers (body column is `story`, not `description`)
          const { error: fundraisersErr } = await supabaseAdmin
            .from("fundraisers")
            .update({
              title: "[deleted]",
              story: null,
              image_url: null,
              purge_at: null,
            })
            .in("organizer_id", organizerIds);
          assertOk("fundraisers", fundraisersErr);

          // 2e. Anonymise organizers. Done per-row because `slug` is NOT NULL
          //     with a unique index, so each needs its own distinct value —
          //     and leaving the old slug would preserve the person's name in
          //     the public /org/<slug> URL after their name was scrubbed.
          for (const organizerId of organizerIds) {
            const { error: orgErr } = await supabaseAdmin
              .from("organizers")
              .update({
                name: "[deleted]",
                slug: `deleted-${organizerId}`,
                bio: null,
                photo: null,
                banner: null,
                // Contact and registration identifiers survived the previous
                // implementation entirely.
                contact_email: null,
                tax_id: null,
                nonprofit_registration_number: null,
                website: null,
                facebook: null,
                twitter: null,
                instagram: null,
                linkedin: null,
                youtube: null,
                tiktok: null,
                purge_at: null,
              })
              .eq("id", organizerId);
            assertOk(`organizers[${organizerId}]`, orgErr);
          }
        }

        // 2f. Only now delete the auth user. Doing this before the scrubs (as
        //     the previous version did) made any scrub failure irreversible:
        //     the account is gone, so nobody can re-trigger deletion.
        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(profileId);
        if (authErr) throw new Error(`auth.deleteUser: ${authErr.message}`);

        purgedCount++;
        console.log(`[PurgeAccounts Cron] Purged user ${profileId}`);
      } catch (userErr: unknown) {
        const msg = userErr instanceof Error ? userErr.message : String(userErr);
        failures.push(profileId);
        console.error(`[PurgeAccounts Cron] Failed to purge user ${profileId}: ${msg}`);
      }
    }

    // Surface partial failure to the caller instead of reporting a clean run.
    return NextResponse.json({
      success: failures.length === 0,
      purged: purgedCount,
      failed: failures.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PurgeAccounts Cron] Fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
