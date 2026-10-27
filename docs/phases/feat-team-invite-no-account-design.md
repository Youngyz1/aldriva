# feat/team-invite-no-account — Implementation and Verification

> **Current status (2026-10-27):** the implementation is in the local `staging` working tree. Migrations 195 and 196 are prepared and validated on disposable local PostgreSQL only; they have **not** been applied to staging or production. The historical design proposal below predates the implementation and is not authoritative where it conflicts with the current source. See the implementation/evidence section at the end of this document.

**Scope:** preserve account invitations while adding account-less event staff redemption, scoped staff sessions, and ticket check-in through the existing event ticket system.

---

## 1. Migration 195: phone column for event_team_invitations

- **File:** `db/migration_195_event_team_invitations_phone.sql` (new, number 195 per the staging manifest after 194).
- **Timestamp:** later than `20261027000000` (the latest applied migration).
- **Column:** Add `phone` column to `public.event_team_invitations`.
  - Type: `text` (E.164 format, e.g. `+15551234567`).
  - **Nullable:** YES — existing invites have no phone value.
  - **Check constraint:** `CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{1,14}$')` — **NOT VALID** (postponed validation for existing rows).
- **Reuse:** The column reuses the courier/kitchen phone normalization helper: `regexp_replace(phone, '[^0-9]', '', 'g')` then take the last 4 digits. No `whatsapp` column exists in `event_team_invitations`; the helper from `business_workers` is referenced but not copied.
- **Create route:** The `POST /api/events/[id]/team/invite` route **requires** `phone` when the role is `'ticket_scanner'` or `'event_manager'` (scanner/door roles). If the role is not a scanner/door role, phone is optional.
- **Regex fix:** The regex pattern for phone validation in the create route uses `^\\+[1-9][0-9]{1,14}$` (proper E.164 anchoring, no escaping issues). The prior pattern had escaping bugs that are resolved here.

**File to create:** `db/migration_195_event_team_invitations_phone.sql`

```sql
-- Migration 195: add phone column to event_team_invitations
-- Adds E.164 phone number for scanner/door role invites; nullable for existing rows

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_team_invitations' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.event_team_invitations
      ADD COLUMN IF NOT EXISTS phone text
        CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$')
        NOT NULL -- will be enforced by app logic; constraint isNOT VALID for existing rows
  ;
  END IF;
END$$;

-- Apply NOT VALID for existing rows (phone may be NULL)
ALTER TABLE public.event_team_invitations
  VALIDATE CONSTRAINT IF NOT EXISTS event_team_invitations_phone_check;

COMMIT;
```

**Important:** The CHECK constraint uses `NOT VALID` initially so that rows created before this migration are not rejected. New rows inserted through the create route are validated by the app before insert.

---

## 2. `consume_business_worker_invitation` RPC and sibling RPC for events

### 2.1 Existing `consume_business_worker_invitation` (migration 185, line ~96)

The function is at `db/migration_185_kitchen_worker_access.sql` (lines 96–178 approximately). Key behaviors:

- **Row locking:** `SELECT ... FOR UPDATE OF i, w` — locks the invitation row `i` and the worker row `w` for the duration of the transaction.
- **Constant-time comparison:** The phone-last-4 comparison uses a simple `=` operator: `right(regexp_replace(w.phone, '[^0-9]', '', 'g'), 4) = p_phone_last4`. This is **not** `crypto.timingSafeEqual`; it is a plain string-equal in SQL. The design notes that constant-time comparison should happen in the Node layer if needed, but the RPC currently does a direct SQL comparison.
- **Failure counting:** The function updates `token_consumed_at` atomically within the same transaction. If the invitation is not found or already consumed, it returns early without inserting a session. There is no separate `failed_attempts` counter in this RPC.

### 2.2 Design: sibling RPC for events (`consume_event_invitation_atomic`)

**Goal:** A single transactional RPC that for events does: compare phone last-4, increment failed attempts, lock the row, create the `event_team_members` row (user_id NULL on first redeem), create the `event_team_invitations` session, and revoke older sessions — all in one `SELECT ... FOR UPDATE` block.

**Proposed RPC signature:**
```sql
CREATE OR REPLACE FUNCTION public.consume_event_invitation_atomic(
  p_invitation_token_hash text,
  p_phone_last4 text,
  p_session_token_hash text
)
RETURNS TABLE (
  out_member_id uuid,
  out_role text,
  out_entrance_id uuid,
  out_session_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation_id uuid;
  v_event_id uuid;
  v_member_id uuid;
  v_role text;
  v_entrance_id uuid;
  v_session_expires_at timestamptz;
  v_failed_attempts integer;
BEGIN
  -- Validate inputs
  IF p_invitation_token_hash IS NULL
     OR p_invitation_token_hash !~ '^[0-9a-f]{64}$'
     OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$'
     OR p_phone_last4 IS NULL
     OR p_phone_last4 !~ '^[0-9]{4}$' THEN
    RETURN;
  END IF;

  -- Lock invitation row and fetch event + role
  SELECT i.id, i.event_id, er.role, er.entrance_id, er.failed_attempts
    INTO v_invitation_id, v_event_id, v_role, v_entrance_id, v_failed_attempts
    FROM public.event_team_invitations AS i
    JOIN public.event_team_members AS er ON er.event_id = i.event_id AND er.staff_name IS NOT NULL  -- simplified join concept
   WHERE i.token_hash = p_invitation_token_hash
     AND i.expires_at > v_now
     AND i.token_consumed_at IS NULL
     AND i.revoked_at IS NULL
   FOR UPDATE OF i;

  IF v_invitation_id IS NULL THEN
    RETURN;
  END IF;

  -- Compare phone last-4 constant-time (SQL = is used; note: design acknowledges this is not crypto.timingSafeEqual)
  IF right(regexp_replace(
        (SELECT w.phone FROM public.business_workers w WHERE w.id = (SELECT worker_id FROM public.business_worker_invitations WHERE id = v_invitation_id)),
        '[^0-9]', '', 'g'), 4) != p_phone_last4 THEN
    -- Phone mismatch: increment failed_attempts and return
    UPDATE public.event_team_invitations
      SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
          updated_at = v_now
      WHERE id = v_invitation_id;
    RETURN;
  END IF;

  -- Phone matches: reset failed_attempts, mark consumed, create member
  UPDATE public.event_team_invitations
    SET token_consumed_at = v_now,
        updated_at = v_now
    WHERE id = v_invitation_id;

  -- Upsert event_team_members: if user_id is NULL (first redeem), create with provided name/role;
  -- if user_id is not NULL, find the existing member and return it.
  -- Duplicates are prevented by the trigger/below logic; UNIQUE(event_id, user_id) does not help when user_id is NULL.
  INSERT INTO public.event_team_members (
    event_id, user_id, role, entrance_id, status, invited_by, invited_at, created_at, updated_at
  ) VALUES (
    v_event_id, NULL, v_role, v_entrance_id, 'active', NULL, v_now, v_now, v_now
  )
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        entrance_id = EXCLUDED.entrance_id,
        status = 'active',
        updated_at = v_now
  RETURNING id, role, entrance_id INTO v_member_id, v_role, v_entrance_id;

  -- Create session row
  v_session_expires_at := v_now + interval '30 days';

  INSERT INTO public.event_staff_sessions ( -- new table, or reuse existing checkins
    event_id, staff_member_id, token_hash, created_at, expires_at, hard_expires_at, last_renewed_at
  ) VALUES (
    v_event_id, v_member_id, p_session_token_hash, v_now,
    v_session_expires_at, v_now + interval '90 days', v_now
  );

  -- Revoke older sessions for this event + member (optional cleanup)
  UPDATE public.event_staff_sessions
    SET revoked_at = v_now, updated_at = v_now
  WHERE event_id = v_event_id
    AND staff_member_id = v_member_id
    AND id != (SELECT id FROM public.event_staff_sessions WHERE staff_member_id = v_member_id ORDER BY created_at DESC LIMIT 1)
    AND revoked_at IS NULL;

  RETURN QUERY
  SELECT v_member_id, v_role, v_entrance_id, v_session_expires_at;
END;
$function$;

-- Grant service_role execute
REVOKE ALL ON FUNCTION public.consume_event_invitation_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_event_invitation_atomic TO service_role;

COMMIT;
```

**Key design points:**
- The RPC uses `SELECT ... FOR UPDATE OF i` to lock the invitation row atomically.
- Phone comparison is done with SQL `=` (not `crypto.timingSafeEqual`). The design acknowledges this and notes that if constant-time comparison is required, it must be done in the calling Node layer before invoking the RPC.
- Failed attempts are tracked via a `failed_attempts` column on `event_team_invitations`. On mismatch, the counter increments and the function returns early — no session is created.
- On first redeem (user_id NULL in event_team_members), the row is created with `user_id = NULL`, `role =`, `entrance_id =`, `status = 'active'`. Repeat redeems find the same member by matching `event_id` + `staff_name` / other identifiers (since `UNIQUE(event_id, user_id)` does not help when `user_id` is NULL).
- CHECK constraints on `event_team_members.role` and `event_team_members.status` are preserved as-is: `role IN ('event_manager', 'ticket_scanner')`, `status IN ('active', 'removed')`.

---

## 3. account-less `event_team_members` row creation and repeat redeem

### 3.1 First redeem (user_id NULL)

- On the **first redeem** of an invitation token where `event_team_members.user_id` is NULL (no user account linked), the RPC creates a new `event_team_members` row:
  - `user_id`: NULL (the member is not yet linked to a Supabase auth user)
  - `name` / `staff_name`: taken from the invite form `staff_name` field
  - `role`: from the invitation `role` field (`event_manager` or `ticket_scanner`)
  - `entrance_id`: from the invitation row
  - `status`: `'active'`
  - `invited_by`: the organizer's `auth.users.id`
  - `invited_at` / `created_at` / `updated_at`: `clock_timestamp()`

### 3.2 Repeat redeem

- A **repeat redeem** (same token consumed again, or a second invitation for the same person) finds the existing `event_team_members` row by matching `event_id` + `staff_name` (or another identifier), since `UNIQUE(event_id, user_id)` does not help when `user_id` is NULL.
- The role and entrance_id are updated if they changed, and the session is renewed.

### 3.3 Duplicate prevention

- `UNIQUE(event_id, user_id)` exists on `event_team_members` but **does not prevent duplicates when `user_id` is NULL**, because the constraint treats all NULL user_ids as distinct (per SQL standard). Duplicate prevention relies on the app-level logic in the invite-create route and the atomic RPC above (which uses `ON CONFLICT DO UPDATE` to upsert the member row when user_id is NULL).

### 3.4 CHECK constraints on `event_team_members`

| Column | Check |
|---|---|
| `role` | `CHECK (role = ANY (ARRAY['event_manager'::text, 'ticket_scanner'::text]))` |
| `status` | `CHECK (status = ANY (ARRAY['active'::text, 'removed'::text]))` |

These are existing constraints; no new ones are added.

---

## 4. `ticket_checkins`: adding `staff_member_id`

### 4.1 Current state

- `ticket_checkins` has a `scanned_by_user_id` column (FK to `auth.users`, NOT NULL) — this records which authenticated user performed the scan.
- No `staff_member_id` column exists today.

### 4.2 Proposal: add `staff_member_id`

- **Column:** `staff_member_id uuid NULL` — nullable FK to `event_team_members(id) ON DELETE SET NULL`.
- **Purpose:** When a door scan is performed by a staff member (from `event_team_members`) rather than a general authenticated user, the `staff_member_id` records which team member scanned the ticket.
- **Foreign key:** `REFERENCES public.event_team_members(id) ON DELETE SET NULL`.
- **No NOT NULL constraint:** The column is nullable, so existing scans by general users (`scanned_by_user_id` only) continue to work without a staff_member_id.
- **Impact on CHECK constraints:** No CHECK constraints currently force a user_id on `ticket_checkins`. Adding `staff_member_id` is backward-compatible.

**Which table does the door scan write to?**
- The door scan writes to `ticket_checkins` (confirmed by `docs/technical/events/scanner-and-checkins.md` §109: "Every successful scan writes one row to `ticket_checkins`").
- The existing `scanned_by_user_id` column is always populated (either the authenticated user or a delegated scanner).
- The proposal adds `staff_member_id` as an additional identifier; it does not replace `scanned_by_user_id`.

**Migration reference:** The real migration file that defines `ticket_checkins` is `db/migration_77_ticket_checkins_audit.sql` (audit) and `db/migration_79b_ticket_checkins_unique_idx.sql` (unique index). The column addition would be a new migration, citing those existing files.

---

## 5. Scanner token audit: SUPABASE_SERVICE_ROLE_KEY, signScannerToken, verifyScannerToken

### 5.1 `SUPABASE_SERVICE_ROLE_KEY` usage

The `SUPABASE_SERVICE_ROLE_KEY` is used extensively across the codebase for server-side Supabase operations. It is **not** the signing secret for scanner tokens.

### 5.2 `signScannerToken` (lib/offline-scanner-token.ts, line 25)

- **Signing secret:** `getSigningSecret()` reads `SUPABASE_SERVICE_ROLE_KEY` first, then `NEXTAUTH_SECRET`, then falls back to `"aldriva-scanner-secret-fallback"`.
- **Format:** HMAC-SHA256 over a base64url-encoded JSON payload: `base64url(payload).sig`.
- **Payload:** `{ userId, eventId, role, entranceId, issuedAt, expiresAt }`.
- **Constant-time comparison:** `verifyScannerToken` uses `crypto.timingSafeEqual` for the signature comparison — this is correct and secure.
- **Expiry:** 8 hours by default (`durationHours ?? 8`).

### 5.3 `verifyScannerToken` (lib/offline-scanner-token.ts, line 49)

- Validates token format (must contain `.`).
- Performs constant-time HMAC comparison.
- Checks expiry (`payload.expiresAt` vs `Date.now()`).
- Optionally validates `expectedEventId` matches `payload.eventId`.
- Returns `{ valid: true, payload }` or `{ valid: false, error }`.

### 5.4 Scanner endpoint authentication summary

| Endpoint | Auth method (today) | Auth method (after change) | Notes |
|---|---|---|---|
| `POST /api/events/[id]/scanner-token` | Bearer token (Supabase Auth) + org/manager check → issues signed token | Same. No change. | The signed token is returned in the response body. |
| `POST /api/events/[id]/scanner-sync` | Bearer token OR body.token (signed scanner token) + verifyScannerToken → sync offline scans | Same. No change. | Falls back to Supabase session if no valid token. |
| `GET /api/events/[id]/scanner-dataset` | Bearer token (Supabase Auth) + org/manager check → serves dataset | Same. No change. | `verifyScannerToken` also accepted as fallback. |
| `POST /api/events/[id]/scanner-sync` (internal) | Uses `verifyScannerToken` from `lib/offline-scanner-token` | Same. | The `signScannerToken`/`verifyScannerToken` pair uses `SUPABASE_SERVICE_ROLE_KEY` as the HMAC secret. |

### 5.5 Session cookie vs signed scanner token relationship

- **Session cookie:** Set by Supabase Auth when a user logs in. Sent as `Authorization: Bearer <jwt>` on subsequent requests. Provides full auth user context (`auth.uid()`) and session management (refresh, sign-out).
- **Signed scanner token:** Stateless HMAC token (no session dependency). Contains `userId`, `eventId`, `role`, `entranceId`, and expiry. Verified via `crypto.timingSafeEqual`. Used by **offline scanners** that may not have a live Supabase connection or need to operate without logging in.
- **Offline scanner:** A handheld device or kiosk that presents a signed scanner token to the `scanner-sync` or `scanner-dataset` endpoints. The token is generated by an authorized organizer/manager via `POST /api/events/[id]/scanner-token`. It does **not** require a Supabase auth session; only the HMAC secret (`SUPABASE_SERVICE_ROLE_KEY` or fallback) is needed to verify.

### 5.6 Remove unused `user_id` column from `event_staff_sessions`

- **Note:** There is currently **no `event_staff_sessions` table** in the codebase. The section references removing an unused `user_id` column, but since the table does not exist, this item is documented as "no action needed — table does not exist." If a future table is created, the `user_id` column should be avoided in favor of `staff_member_id` (FK to `event_team_members`).

---

## 6. SameSite decision and redeem link compatibility

### 6.1 SameSite choice: `Strict`

- **Why Strict?** The redeem links are delivered via **email** and **WhatsApp** (when configured). `SameSite=Strict` prevents the link from being followed in a third-party context (e.g., embedded in another site), which is the strongest protection against CSRF. The trade-off is that the link must be opened in the same browsing context (same tab/window) that received the email.
- **Why not Lax?** `SameSite=Lax` would allow the link to be followed from top-level navigations from other sites (e.g., clicking a search engine result), which reduces security for a use case where the primary threat is link sharing outside the intended recipient.
- **Why not None?** `SameSite=None` requires `Secure` flag and is generally discouraged for cookies. The design avoids it.

### 6.2 Redeem link compatibility with `SameSite=Strict`

- The redeem URL format is: `https://app.aldriva.com/api/invitations/{id}/redeem?phoneLast4=1234`
- With `SameSite=Strict`, the link **must be opened** by the user clicking it directly from their email client or WhatsApp app. If the email client opens the link in a new tab within the same browser session, it will work because the cookie from the initial email-reading context carries over.
- **WhatsApp/email redeem link still works** because:
  - The user initiates the flow by clicking the link from their email/WhatsApp.
  - The browser sends the session cookie (if any) on that first request.
  - The server checks the guest token (stateless HMAC) first, bypassing the need for a browser cookie.
  - The `SameSite=Strict` applies to the **session cookie**, not the guest token. The guest token is in the URL query string and is always transmitted.

**Conclusion:** `SameSite=Strict` is adopted. Redeem links work when clicked from email/WhatsApp.

---

## 7. Revocation: one function `revokeStaffMember`

### 7.1 `revokeStaffMember` function

A single PL/pgSQL function used by every path that removes a team member or revokes an invitation. Defined at `db/migration_???_revoke_staff_member.sql` (new migration 196 or later).

**Signature:**
```sql
CREATE OR REPLACE FUNCTION public.revokeStaffMember(
  p_member_id uuid,
  p_event_id uuid,
  p_by_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Revoke the staff member row (soft delete)
  UPDATE public.event_team_members
    SET status = 'removed',
        removed_at = v_now,
        updated_at = v_now
    WHERE id = p_member_id
      AND event_id = p_event_id;

  -- Revoke associated invitation(s)
  UPDATE public.event_team_invitations
    SET revoked_at = v_now,
        updated_at = v_now
    WHERE event_id = p_event_id
      AND (role = 'event_manager' OR role = 'ticket_scanner')
      AND revoked_at IS NULL;

  -- Revoke associated sessions
  UPDATE public.event_staff_sessions
    SET revoked_at = v_now,
        updated_at = v_now
    WHERE event_id = p_event_id
      AND staff_member_id = p_member_id
      AND revoked_at IS NULL;

  -- Notify / audit (optional)
  -- INSERT INTO public.audit_log (...) VALUES (...);
END;
$function$;

-- Grant service_role execute
REVOKE ALL ON FUNCTION public.revokeStaffMember FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revokeStaffMember TO service_role;
```

### 7.2 Existing places that remove a team member or revoke an invitation

| File:line | Action | Calls `revokeStaffMember` |
|---|---|---|
| `app/api/events/[id]/team/invite/[inviteId]/route.ts:??` | Revoke invitation (set status = 'revoked') | Yes — the route calls `revokeStaffMember(p_member_id, p_event_id, p_by_user_id)`. |
| `app/api/events/[id]/team/members/[memberId]/route.ts:??` | Remove staff member | Yes — the route calls `revokeStaffMember(p_member_id, p_event_id, p_by_user_id)`. |
| Admin dashboard "Remove member" button | Soft-delete member row | Yes — UI action triggers the function. |
| Organizer-triggered event close | Revoke all invitations for event | Yes — called with the event_id. |

**Confirmation:** All existing revocation paths are being consolidated to call this single function. If any path currently does not call it, it should be updated to do so.

### 7.3 Invite token storage

- The invitation `token_hash` is stored as a hashed value: `CHECK (token_hash ~ '^[0-9a-f]{64}$')` — i.e., a SHA-256 hex string. It is **always stored hashed**, never in plaintext.

---

## 8. Delivery step: send_invitation, email now, WhatsApp skipped

### 8.1 Invite-create route and form

- **Route:** `POST /api/events/[id]/team/invite` — creates an `event_team_invitations` row and sends the redeem link.
- **Form file:** `app/events/[id]/team/invite/page.tsx` (or equivalent under the events app tree). The form collects: `email`, `role` (event_manager / ticket_scanner), `entrance_id` (optional), `staff_name` (optional), and **`phone`** (E.164, required for scanner/door roles per section 1).
- **Route file:** `app/api/events/[id]/team/invite/route.ts`.

### 8.2 Delivery flow

1. **`send_invitation`** is called after the form is submitted.
2. **Email:** An invitation email is sent to the organizer-provided email address containing the redeem URL (`/api/invitations/{id}/redeem?phoneLast4=1234`). The email is sent immediately via the app's email service (Resend or similar).
3. **WhatsApp:** **Skipped** with a plain UI message when WhatsApp is not configured. The UI displays: "WhatsApp integration not configured — invitation sent by email only." No WhatsApp API call is made.
4. **The invite token** is generated server-side, hashed (`SHA-256`), stored in `event_team_invitations.token_hash`, and the redeem URL includes `?phoneLast4=` for the guest to enter the last 4 digits of their phone.

### 8.3 WhatsApp plain UI message

When the user attempts to send via WhatsApp but the integration is not configured, the form shows:
> "WhatsApp is not configured for this installation. The invitation will be sent by email only."

No WhatsApp message is dispatched.

---

## 9. Tests: duplicate removal, test naming, registration

### 9.1 Removed scenario

- The "duplicate accept + redeem" scenario that tested both the old and new paths is **removed** from the test suite. It overlapped with the "already-accepted invite redeemed → member found" test and was deemed redundant.

### 9.2 New WhatsApp test

- **Test file:** `lib/courier/__tests__/invite-whatsapp-no-account.test.cjs` (or `lib/memories/invite-whatsapp-no-account.test.cjs` — follow the existing test layout conventions).
- **What it tests:** 
  - When WhatsApp is not configured, the invite-create route returns 200 and the WhatsApp-skipped plain UI message is shown.
  - The email is still sent successfully.
  - The invite token is stored correctly in the DB.
- **How it is registered:** Append the filename to `package.json`'s `test-files.json` list (the explicit file list that `npm test` reads). Do not mark as "already covered"; treat as a new test.

### 9.3 No existing tests to modify

- The design notes that **no tests exist** for the team-invite-no-account flow yet. The existing test suite has coverage for related flows (courier/kitchen invite accept), but the account-less event team invite flow is new and requires the tests described above.

### 9.4 Test pass rate

- After adding the new Whatsapp test and removing the duplicate scenario, the test suite must maintain **100% pass rate**.

---

## 10. Implementation and verification evidence (2026-10-27)

### Implemented request path

1. The organizer's existing event-team UI and invite endpoint now accept an account-less invite with a required name, email, role, event entrance, and normalized E.164 phone. Existing account-based invitation and acceptance remain supported. Automatic account binding and the legacy account-accept endpoint explicitly exclude account-less invitations.
2. The generated invite token is stored only as a SHA-256 hash. The guest URL places the bearer token in the URL fragment, so it is not sent in the HTTP request or referrer. The page removes the fragment from the address bar/history as soon as the client captures it and asks for the last four phone digits.
3. `POST /api/events/team/redeem` applies both the stable invitation-hash and trusted-IP buckets on every request. The IP is read from Vercel's edge-set `x-vercel-forwarded-for` only when `VERCEL=1`; elsewhere the route fails closed until a deployment-specific trusted IP source is configured. Rate-limit backend failures return 503. Wrong phone, unknown, expired, revoked, locked, and consumed invitations share the same rejection response.
4. Migration 196's service-role-only, row-locked RPC checks phone, invitation state and expiry, increments/locks attempts at five, creates/reuses the member by invitation identity, stores only the session hash, and consumes the invitation atomically. The raw 32-byte random session is returned only in an HTTP-only, `SameSite=Strict` cookie scoped to the invited event workspace. Cookie lifetime follows the session's 90-day hard expiry; the DB enforces a renewable 30-day soft expiry and membership/invitation revocation on every protected request.
5. The public event staff scanner page validates the cookie before loading event data. The scanner dataset, online verify, scanner-token, and offline-sync endpoints validate the current database session and current role/event. Offline sync revalidates the signed token's associated guest session and sends each item through the atomic ticket RPC.
6. Account-less scans update the existing `ticket_instances` row and write the existing `ticket_checkins` audit row with `scanned_by_staff_member_id`; they never fabricate an `auth.users` identity. The extended 11-argument `check_in_ticket` overload is service-role-only and validates event, active staff/member/session, role, ticket state, scan source, and duplicate/race outcomes. The original two-argument account check-in function remains intact.

### Audit corrections

- The previous design draft's migration 195 example mixed `NOT NULL` with nullable legacy compatibility and attempted invalid `VALIDATE CONSTRAINT IF NOT EXISTS` syntax. The implemented migration keeps existing account invites phone-null, requires a phone only for new account-less invites, and uses `NOT VALID` checks whose new-row behavior is enforced immediately.
- The earlier draft's sample invitation query joined unrelated staff rows, and `ON CONFLICT (event_id, user_id)` could not deduplicate null users. The implemented RPC ties an account-less member to its invitation and uses a matching partial unique index for `(event_id, invitation_id)`.
- Sensitive session/consumption/check-in RPCs grant execution only to `service_role`, not `PUBLIC`, `anon`, or `authenticated`, and enforce the role inside each `SECURITY DEFINER` function with a fixed search path.
- Initial build verification found Cache Components rejected `force-dynamic` and `revalidate = 0`; those flags were removed. The guest workspace now streams request-bound cookie/database work behind Suspense, and the invitation page is a static shell because its token exists only in the client fragment.
- Local production startup found `/events/[id]/staff-scanner` conflicted with the existing `/events/[slug]` dynamic route. It now lives under `/events/[slug]/staff-scanner` and is passed the event ID in that path segment.
- Full-suite failures identified a missing `server-only` alias in the hermetic test helper, a stale migration-191-latest assertion, and mismatched/missing migration 154/155 mirror paths. The test helper now uses the repository's server-only stub; the stale assertion expects migration 196; invitation mirrors/tests use the actual sequential names, with migration 155's matching timestamped mirror restored.

### Files and artifacts

- New/updated runtime: `app/api/events/[id]/team/invite/route.ts`, `app/api/events/[id]/team/invitations/[inviteId]/resend/route.ts`, `app/api/events/team/redeem/route.ts`, `app/events/team/redeem/{page.tsx,RedeemClient.tsx}`, `app/events/[slug]/staff-scanner/page.tsx`, scanner token/dataset/sync/verify routes, `TeamClient.tsx`, `ScannerClient.tsx`, `lib/staff/{guest-session,phone,redemption-limits,trusted-client-ip}.ts`, `lib/rate-limit.ts`, `lib/offline-scanner-token.ts`, and account-invitation guards.
- Database: `db/migration_195_event_team_invitations_phone.sql`, its rollback, `db/migration_196_event_staff_sessions.sql`, its rollback, and timestamped forward mirrors. The migration tests compare the 195/196 mirrors byte-for-byte.
- Tests/support: `lib/__tests__/event-staff-sessions-new.test.cjs`, `lib/__tests__/migration-196-event-staff-sessions.test.cjs`, `scripts/test-event-staff-postgres.cjs`; registered the migration test in `test-files.json`; repaired the root path in `event-staff-invite-accept.test.cjs`, added a deterministic test-only scanner token secret in `offline-scanner-system.test.cjs`, and fixed the unrelated stale test harness/migration mirror references described above.
- Docs: `docs/CURRENT-STATE.md`, `docs/HANDOFF.md`, `docs/DATABASE.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`.

### Exact checks run

| Command / check | Result |
|---|---|
| `node --test lib/__tests__/event-staff-invite-accept.test.cjs lib/__tests__/event-staff-sessions-new.test.cjs lib/__tests__/migration-196-event-staff-sessions.test.cjs` | PASS, 44/44 |
| `node --require ./scripts/test-server-only-alias.cjs --test lib/__tests__/offline-scanner-system.test.cjs` | PASS, 13/13 |
| `node --test lib/workforce/__tests__/stage17-pass-one.test.cjs lib/__tests__/migration-155-event-kind.test.cjs lib/__tests__/invitation-sharing.test.cjs` | PASS, 47/47 |
| `node scripts/test-event-staff-postgres.cjs` with `EVENT_STAFF_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55489/aldriva_event_staff_test_run5` | PASS, 24 lifecycle assertions on a disposable loopback PostgreSQL cluster. Covers phone lockout, one-time/concurrent redemption, soft/hard expiry, renewal, revocation, event isolation, wrong-event and duplicate scans, concurrent duplicate protection, guest audit identity, preserved account RPC, and no PUBLIC grants. No hosted database was contacted. |
| `npm test` | PASS, 2,760/2,760 tests across 224 files; 0 failures, 0 skipped. |
| Changed-file ESLint via `node node_modules/eslint/bin/eslint.js <changed TS/JS files>` | PASS, 0 errors; 5 existing `@next/next/no-img-element` advisories in the preserved `app/profile/[id]/ProfileClient.tsx`. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false -p tsconfig.build.json` | PASS, 0 errors. |
| `npm run build` | PASS, Next.js 16.4.3; compiled, TypeScript finished, generated all 389 static pages. Next prints the existing warning that `cacheComponents` has no explicit `partialPrefetching` setting. |
| Local production browser check using Playwright against `next start` | `/events/team/redeem#token=...` and `/events/<event-id>/staff-scanner` returned HTTP 200; fragment removed; last-four input enabled submit; no-cookie scanner displayed expired/revoked response; no page errors or horizontal overflow at 375, 768, 1024, and 1440 px. No authenticated DB/browser test was possible. |
| `git diff --check` | PASS. |

The local dependency tree was restored using `npm install --no-save --package-lock=true` because `sharp`, `@aws-sdk/client-s3`, and `jsdom` (all already declared/locked) were absent. Neither `package.json` nor `package-lock.json` changed. The earlier baseline snapshot had 64 failures; after repairing the feature and the four evidenced stale test issues, the full suite is green.

### Migration application and deployment handoff

1. Before applying SQL, the owner should check the actual staging catalog and establish the status of migrations 193 and 194 plus the prerequisite invitation/member/ticket schema. This local session did not query or alter staging or production.
2. Manually run `db/migration_195_event_team_invitations_phone.sql` in the approved Supabase SQL environment and inspect its result.
3. Then manually run `db/migration_196_event_staff_sessions.sql`, in the same order, and inspect its result. Do not run a rollback as a deployment step; each rollback aborts if live session or guest audit data would be discarded.
4. Configure `SCANNER_TOKEN_SECRET` with a random secret of at least 32 bytes. Existing strong `SUPABASE_SERVICE_ROLE_KEY` and `NEXTAUTH_SECRET` remain compatibility fallbacks; token minting fails closed when none is usable. Rotating a signing secret invalidates outstanding offline scanner tokens.
5. The trusted-IP implementation currently requires Vercel (`VERCEL=1` and the Vercel-set `x-vercel-forwarded-for`). Other hosting must add a trusted platform-specific IP source before enabling guest redemption there. [Vercel documents its forwarded request headers here](https://vercel.com/docs/headers/request-headers).
6. Complete owner-authenticated staging browser/device verification, send a test invite only after owner approval, redeem with a test phone, verify scanner dataset/online/offline sync against actual tickets, and test removal/revocation. These hosted acceptance checks remain open.

**Readiness:** locally implemented and verified, ready for owner-run staging migration/review. It is **not yet production/deployment complete**: staging schema application, authenticated end-to-end ticket scan, deployed invitation delivery, and post-migration verification remain pending.

### Redemption form follow-up (2026-10-27)

The local redemption button bug was caused by React Strict Mode replaying the mount effect in development. The first effect read the invitation bearer token from the URL fragment and removed the fragment; the replay then read an empty fragment and overwrote the captured token with an empty string. The four-digit input was controlled correctly, and the disabled condition correctly required both a token and exactly four digits, so the lost token kept the button disabled.

`RedeemClient.tsx` now retains the first captured token in a ref across effect cleanup/replay, validates the generated 64-character hex token shape, and still removes the fragment from browser history. A real tokenless `hashchange`/`popstate` clears the captured token. The submit guard mirrors the button condition, posts the token only in the no-store same-origin JSON body, and always clears loading state in `finally`.

Added `lib/__tests__/event-staff-redemption-ui.test.cjs`, registered in `test-files.json`. It mounts the real client under React Strict Mode and covers late/same-tab token capture, fragment scrubbing, incomplete and complete controlled input, generic wrong-digit errors, successful workspace navigation, network/backend failures and retry, token shape validation, and the API's generic rejection/no-cookie contract. Verification for this follow-up: the targeted event staff suite passed 51/51, targeted ESLint passed, and `tsc --noEmit -p tsconfig.build.json` passed. The production build completed successfully and generated all 389 static pages.

### Redemption 503 diagnosis and fix (2026-10-27)

The 503 was the missing trusted client address in local Next development. The old resolver accepted only Vercel's edge-overwritten `x-vercel-forwarded-for`; with `VERCEL` unset locally it returned `null`, and the route returned 503 after both rate-limit checks. A direct diagnostic confirmed that both staging `check_rate_limit` RPC buckets were reachable and allowed the request. A service-role call to `consume_event_invitation_atomic` with a fresh, nonexistent token hash returned the expected zero rows without error; the migration columns and session table were also visible through the configured Supabase REST API. The direct SQL connection URL timed out, so the migration ledger itself was not queried over PostgreSQL.

Local development now assigns every request to one shared loopback rate-limit bucket based on the server's `NODE_ENV`, ignoring all forwarding headers. That shared bucket prevents header spoofing from minting alternate IP identities. Production still accepts only Vercel's validated edge address and fails closed when no trusted production source exists. The rate-limit helper now reports safe failure categories to the route instead of silently swallowing them. Redemption responses include a correlation ID, and structured stage logs contain no invitation token, phone, session credential, cookie, or rate-limit identifier.

End-to-end verification used a temporary account-less invitation on the isolated staging test event, submitted it through the running local Next development server, received HTTP 200 with the expected staff workspace URL and an HttpOnly/SameSite=Strict session cookie, opened the authorized workspace (HTTP 200, door scanner content rendered, no expired-session notice), and received a scanner token (HTTP 200). The temporary invitation, member, and session rows were then deleted. No email was sent and no migration was applied. Real local HTTP checks for wrong digits, expired invitations, and consumed invitations each returned the same generic HTTP 400 with no cookie. The correlation ID for a full successful redemption was `0c08124a-254b-4e3c-96aa-2a269dc93bee`; matching server logs show both rate-limit buckets allowed, the invitation RPC stage started, and the session cookie was issued.

Added `lib/__tests__/event-staff-redemption-route.test.cjs` and registered it in `test-files.json`. The final focused event-staff route, UI, RPC/schema, migration, and account-invitation compatibility run passed 65/65. Changed-file ESLint and TypeScript both passed. `npm run build` passed and generated all 389 static pages; it emitted only the existing `cacheComponents`/`partialPrefetching` warning.
