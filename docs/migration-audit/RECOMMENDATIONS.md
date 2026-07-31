# Recommendations (Not Part of the Migration)

Everything in this document is an **optional** observation about the current production platform. None of it is required for the standalone fundraising application to function, none of it is reflected in `sql/001`–`sql/011`, and none of it should be applied as part of the migration itself. The migration's goal is to reproduce production behavior exactly; this document exists so the observations made during the audit aren't lost, and so they can be evaluated later, on their own timeline, separately from cutover.

**If any item below is adopted, apply it as its own change against the new project, after the migration is verified against `05-verification-checklist.md` — not bundled into cutover.** Bundling a behavior change with a migration makes it much harder to tell which one caused a problem if something breaks post-cutover.

---

## RLS policy observations

1. **`events` and `tickets` have unconditional public INSERT policies** (`WITH CHECK (true)`, role `public`). Anyone holding the anon key can insert arbitrary rows: no ownership check, no `auth.uid() = user_id` requirement, no status gate. This differs from `fundraisers`/`products`/`businesses`, which all gate INSERT on `auth.uid() = owner_id` plus a `pending_review`-style status. This may be an intentional client-side-creation flow (with server-side validation elsewhere) or a gap from before ownership checks were retrofitted onto the other tables — worth confirming with whoever owns `app/create-event` and the ticket-purchase flow, but out of scope for this migration to decide.

   *Illustrative fix, not applied anywhere:*
   ```sql
   drop policy "Allow public insert" on public.events;
   create policy "Users can create their own events" on public.events
     for insert to public
     with check (auth.uid() = user_id);

   drop policy "Allow public insert" on public.tickets;
   create policy "Authenticated users can create tickets for their events" on public.tickets
     for insert to public
     with check (
       exists (select 1 from events where events.id = tickets.event_id and events.user_id = auth.uid())
     );
   ```

2. **`fundraisers` "Anyone can create a fundraiser pending review"** has `WITH CHECK (status = 'pending_review')` only — no `auth.uid() = user_id` check, so `user_id`/`organizer_id` can be set to anything on insert (can't self-publish, but can impersonate on creation). Same category as #1, lower severity.

3. **`organizers` has a redundant permissive SELECT policy.** "Public read organizers" (`USING (true)`) coexists with "Public organizers are readable" (`USING (visibility = 'public' OR auth.uid() = user_id)`). Permissive policies OR together, so the `true` policy makes the `visibility` gate dead code — every organizer row is publicly readable regardless of its `visibility` setting, which sits oddly next to the existence of `organizer_visibility_audit` (an audit trail for a control that isn't currently enforced).

   *Illustrative fix, not applied anywhere:*
   ```sql
   drop policy "Public read organizers" on public.organizers;
   -- "Public organizers are readable" remains and becomes the effective policy.
   ```

4. **Duplicate, functionally-identical SELECT policies** exist on `fundraiser_media` ("Fundraiser media is publicly readable" + "Public can view fundraiser media") and `organizer_follows` ("Anyone can view follows" + "Organizer follows are publicly readable"). Harmless (both sides of each pair are `USING (true)`), just redundant — likely leftover from a rename that didn't drop the old policy.

5. **`reviews` "Admins can manage all reviews"** checks `profiles.role = 'admin'` but, unlike every other admin-check policy in the schema, omits `AND profiles.status = 'active'`. A suspended admin account retains full review-management rights. Minor inconsistency, not currently exploitable by a non-admin.

## View observations

6. **Both `public_donation_activity` and `public_profiles` are `SECURITY DEFINER` views** (Postgres's default when `security_invoker` isn't explicitly set) — flagged ERROR-level by Supabase's security advisor. They run with the view owner's privileges against `donations`/`fundraisers`/`profiles`, bypassing the querying user's own RLS on those tables.
   - `public_donation_activity` exposes donor `user_id` + `amount` for every `succeeded`/`completed` donation to any anon caller, filtered only by the view's own `WHERE` clause (not `donations`' owner/admin-only RLS). Very plausibly an intentional "public donation feed," but the access model lives entirely in the view definition rather than being visible as an RLS policy on `donations` itself.
   - `public_profiles` re-implements an equivalent `privacy_settings->>'profile_visibility'` check in its own `WHERE` clause, so it's lower-risk — a user can only ever make their own row public/private via the existing `profiles` UPDATE policy.

   *Illustrative fix, not applied anywhere (verify against actual read expectations first — this changes what anon callers see):*
   ```sql
   alter view public.public_donation_activity set (security_invoker = on);
   alter view public.public_profiles set (security_invoker = on);
   ```

## Function observations

7. **`check_email_pending_deletion` combines `SECURITY DEFINER` with an unset/mutable `search_path`.** This is the one function in the schema where a `search_path`-manipulation attack against a definer-privileged function is theoretically possible (the other 3 `SECURITY DEFINER` functions — `get_total_raised`, `get_comment_like_counts`, `handle_new_user` — already pin `search_path = public`).

8. **The other 15 functions (all `SECURITY INVOKER`) don't pin `search_path` either.** Lower severity since invoker-context execution can't do anything the caller couldn't do directly, but it's cheap, uniform hardening if ever applied.

   *Illustrative fix, not applied anywhere:*
   ```sql
   alter function public.check_email_pending_deletion(text) set search_path = public;
   -- repeat for the other 15 SECURITY INVOKER functions if desired; see
   -- 02-functions-triggers-views.md for the full list of 19.
   ```

9. **4 functions are directly callable via `/rest/v1/rpc/...` by `anon`/`authenticated`** because Supabase's default `GRANT EXECUTE ON ALL ... TO PUBLIC`-style bootstrap applies to every function in `public`, not because each was individually reviewed for public RPC exposure: `get_total_raised`, `get_comment_like_counts`, `check_email_pending_deletion`, and (as a trigger function, where direct calls are essentially inert) `handle_new_user`. Additionally, `recalculate_event_rating`, `recalculate_fundraiser_rating`, `recalculate_organizer_rating`, and `release_expired_seat_reservations` are plain (non-`SECURITY DEFINER`) functions that are also directly callable — low impact (recomputing an aggregate, or releasing stale seat holds), but not obviously meant to be public RPC surface.

   *Illustrative fix, not applied anywhere — verify against `grep -rn '\.rpc(' app/ lib/` before revoking anything a client actually calls:*
   ```sql
   revoke execute on function public.enforce_article_status_transition() from anon, authenticated;
   revoke execute on function public.handle_new_user() from anon, authenticated;
   -- etc. for the other trigger-only helper functions listed in 02-functions-triggers-views.md
   ```

## Storage observations

10. **All 7 storage buckets are public with no `file_size_limit` and no `allowed_mime_types`.** Any authenticated uploader can push arbitrarily large files of any type.

    *Illustrative fix, not applied anywhere — verify actual upload requirements against `hooks/use-image-upload` and related components before picking limits:*
    ```sql
    update storage.buckets set file_size_limit = 10485760, -- 10 MB
      allowed_mime_types = array['image/png','image/jpeg','image/webp']
      where id in ('organizer-banners','organizer-images','profile-images','event-banners','fundraiser-media');
    update storage.buckets set file_size_limit = 209715200, -- 200 MB
      allowed_mime_types = array['video/mp4','video/webm','video/quicktime']
      where id in ('event-videos','videos');
    ```

11. **`event-banners` has zero `storage.objects` policies**, unlike the other 6 buckets (which each have an explicit "authenticated can upload" + "public can read" pair). Reads still work via the public object-URL path (the bucket is public), but no anon/authenticated upload path exists — only `service_role` can write there currently. May be intentional (server-side-only banner uploads); confirm before treating as a gap.

12. **Ownership-scoping is inconsistent across buckets.** Only `fundraiser-media` and `profile-images` restrict uploads/deletes to the uploader's own folder (`(storage.foldername(name))[1] = auth.uid()`). `event-videos`, `organizer-banners`, `organizer-images`, and `videos` only check `auth.role() = 'authenticated'` with no path scoping — any authenticated user can upload into (or overwrite, since Storage upserts by default) any path in those four buckets.

13. **The broad `SELECT` policies on 6 of 7 buckets allow directory listing**, not just fetch-by-known-URL (flagged WARN by the security advisor). Public buckets don't need a SELECT policy at all for the object-URL read path to work; the existing policies additionally permit enumerating every file in the bucket.

## Miscellaneous

14. **Leaked-password protection — still open, NOT confirmed on either project despite lint text suggesting otherwise on `supabase-new`.** Originally: disabled in production (Supabase Auth's HaveIBeenPwned check), an Auth *project setting* in the Dashboard, not a schema/SQL change, and flagged here as out of scope for the migration itself. **Decision (2026-07-23): actively enable it on both projects** as a deliberate security improvement, rather than just carrying forward production's old disabled state.

    **Complication found (2026-07-23, re-verification pass)**: both projects are confirmed **Free plan**, and per Supabase's own docs ("Leaked password protection is available on the Pro Plan and above") plus a Supabase community discussion (GitHub `orgs/supabase/discussions/35605`), this feature is **not available at all on Free plan** — the discussion describes Free-plan projects showing a *persistent* advisor warning specifically because the feature cannot be turned on, which matches production's behavior (lint present, unchanged across three checks this session) but does **not** match `supabase-new`'s behavior (lint absent, consistent across two checks). The lint's absence on a Free-plan project is suspicious rather than reassuring — it most plausibly means the *stored config toggle* was flipped to "on" in the Dashboard (silencing the lint, which may only read that stored flag) without the underlying HaveIBeenPwned check actually being enforceable on a Free-plan project.
    - Attempted a live functional test: signup against `supabase-new` with a known-leaked password (`123456789`), plus a control signup with a strong/unique password. **Both timed out identically** (curl exit 28, no HTTP response) — since the control failed the same way, this points to a sandbox/network restriction on outbound requests from this environment, not a signal about the leaked-password check itself. No functional confirmation was obtained.
    - **Status: unresolved on both projects.** Do not treat the earlier "confirmed enabled" language for `supabase-new` as settled — it was based on lint-absence alone, which this pass shows may not mean what it appeared to mean on a Free-plan project. Production remains unconfirmed as before (lint still present after three checks). Next step: either upgrade to Pro on the project(s) where this matters, or get a genuine functional test run from an environment without this session's network restriction (e.g. the actual deployed app, or a developer's own machine) before documenting this as resolved anywhere.

15. **Inconsistent `ON DELETE` behavior** on 7 FKs to `auth.users`/`organizers` (`events.user_id`, `events.organizer_id`, `fundraisers.user_id`, `organizers.user_id`, `donations.fundraiser_id`, `tickets.event_id`, `ticket_orders.seat_id`, `platform_settings.updated_by` all default to `NO ACTION` where most sibling FKs use `CASCADE`/`SET NULL`). **This is preserved as-is in the migration** (see `01-schema-report.md`) — flagged here only because it will surface as a hard failure the first time an account-deletion flow tries to delete a user who owns events/fundraisers/an organizer profile. Confirm with the product owner whether that's intended friction or an oversight; either way, it is current production behavior and the migration reproduces it unchanged.

16. **`fundraisers.raised` and `fundraisers.raised_amount` both exist**, and `update_fundraiser_raised()` probes `information_schema.columns` at runtime to decide which to write. **Preserved as-is** — not a migration concern, but worth consolidating eventually; confirm which column the frontend actually reads before dropping either.

17. **Facebook auth provider — new scope deviation, status: planned/in progress, not resolved.** Facebook has been manually enabled as an auth provider on `supabase-new` via the Dashboard. Production (`jnobheduodpvojwzbpra`) does **not** have Facebook auth — confirmed via `auth.identities` (only `email` and `google` rows exist there, re-verified 2026-07-23). This is a genuine new capability being added during migration, not something the original audit missed (production has never had it).
    - **Intent: permanent.** Facebook login is planned to be supported going forward on both projects, not just as an experiment on `supabase-new`.
    - **Current blocker**: the Facebook app has not cleared Facebook's App Review for the login permission. Until it does, "Sign in with Facebook" only works for accounts with a role on the Facebook app (admin/developer/tester) — real end users will get a **Facebook-side** error, not a Supabase error. This is separate from the previously-tracked posting-permission App Review (`pages_manage_posts`/`pages_read_engagement`), which is also still pending.
    - **Not yet done**: enabling this on production, and confirming production should get it at all — before or after cutover. That decision itself has not been finalized; only the general intent to support Facebook login eventually is settled.
    - Verified 2026-07-23: `supabase-new`'s `auth.identities` currently has 0 rows (empty — the Phase 4 test-signup row was already cleaned up, and no one has actually signed in via Facebook yet), so this is a Dashboard-config-level deviation only, not something exercised end-to-end yet.

---

## Priority if these are ever acted on

Roughly in order of value-for-effort, independent of the migration:
1. Fix #7 (`check_email_pending_deletion` search_path) — one line, closes the only genuine privilege-escalation-shaped gap.
2. Decide on #1/#2 (public insert policies) and #3 (organizers dead-code visibility policy) — these determine actual access control behavior, worth a deliberate product decision either way.
3. #10 (storage size/MIME limits) — cheap, reduces blast radius.
4. Everything else is low-urgency hygiene (#4, #5, #8, #9, #12, #13, #14).
