import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  hasEventOrOrganizerAccess,
  EVENT_TEAM_ROLES_SCANNER,
  EVENT_SCAN_ENTITY_ROLES,
} from "@/lib/event-auth";
import type { EventTeamRole } from "@/lib/event-auth";
import type { EntityRole } from "@/lib/entity-auth";
import { verifyScannerToken } from "@/lib/offline-scanner-token";
import type { CodeType, ScanAction } from "@/lib/offline-scanner-token";
import { isScannerTokenRevoked } from "@/lib/staff/scanner-revocations";
import { validateEventStaffSession, eventStaffSessionCookieName } from "@/lib/staff/guest-session";
import { isGuestScannerEnabled } from "@/lib/staff/guest-scanner-flag";

const EVENT_ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Narrower than the DOM Request type: lets a caller (scanner-sync) pass a
// lightweight wrapper that layers a body-supplied token onto the same
// header-reading interface, without needing a real Request object.
export interface ScannerRequestLike {
  headers: { get(name: string): string | null };
}

export interface ResolvedScannerPrincipal {
  version: 1 | 2;
  userId: string | null;
  staffMemberId: string | null;
  eventId: string;
  role: string;
  codeType: CodeType[];
  actions: ScanAction[];
  entranceId?: string | null;
}

export type ResolveResult =
  | { ok: true; principal: ResolvedScannerPrincipal }
  | { ok: false; status: number; code: string };

function isEventTeamRole(role: string): role is EventTeamRole {
  return role === "event_manager" || role === "ticket_scanner";
}

function looksLikeScannerToken(token: string): boolean {
  return token.split(".").length === 2;
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

async function authorize(
  principal: ResolvedScannerPrincipal,
  requires: { codeType: CodeType; action: ScanAction },
  requestId: string,
  recheckMembership = true,
  entityRoles: EntityRole[] = EVENT_SCAN_ENTITY_ROLES
): Promise<ResolveResult> {
  // A staff-member-identified principal (guest cookie session, or a scanner
  // token minted for a staff member) is authorised by the role already
  // embedded in its validated session or signed token, never by looking up
  // a staff member id as if it were a user id.
  let canScan: boolean;
  if (principal.userId) {
    // recheckMembership=false matches scanner-sync's Phase 0 token path
    // (496e1ccf8), which trusted a valid, non-revoked token's embedded role
    // without an extra live DB lookup on every request.
    canScan = recheckMembership
      ? await hasEventOrOrganizerAccess(
          principal.userId,
          principal.eventId,
          EVENT_TEAM_ROLES_SCANNER,
          entityRoles
        )
      : true;
  } else {
    canScan = isEventTeamRole(principal.role);
  }

  if (!canScan) {
    return { ok: false, status: 403, code: "no_permission" };
  }

  if (!principal.codeType.includes(requires.codeType) || !principal.actions.includes(requires.action)) {
    console.error("[scanner-capability]", { requestId, eventId: principal.eventId, missing: requires });
    return { ok: false, status: 403, code: "scanner_capability_denied" };
  }

  return { ok: true, principal };
}

export async function resolveScannerPrincipal(
  req: ScannerRequestLike,
  opts: {
    eventId: string;
    requires: { codeType: CodeType; action: ScanAction };
    requestId: string;
    // Whether a scanner-token-derived principal's membership is re-checked
    // against live DB state on every request. Defaults to true, matching
    // scanner-dataset's Phase 0 behaviour (496e1ccf8). Pass false for a
    // caller that wants scanner-sync's Phase 0 token-path behaviour instead
    // (trust a valid, non-revoked token's embedded role, no DB re-check).
    recheckMembership?: boolean;
    // Entity-wide roles accepted alongside an event_team_members role.
    // Defaults to EVENT_SCAN_ENTITY_ROLES (owner/admin/manager - no editor).
    entityRoles?: EntityRole[];
  }
): Promise<ResolveResult> {
  const { eventId, requires, requestId } = opts;
  const admin = createSupabaseAdmin();

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();

    if (looksLikeScannerToken(token)) {
      const verified = verifyScannerToken(token, eventId);
      if (verified.valid) {
        const p = verified.principal;
        // Revocation is checked before anything else can authenticate the
        // request with this token: a revoked token is rejected outright,
        // with no fall through to cookie or guest auth.
        const revocation = await isScannerTokenRevoked(
          admin,
          {
            eventId: p.eventId,
            jti: p.jti,
            userId: p.userId,
            staffMemberId: p.staffMemberId,
            issuedAt: p.iat,
          },
          requestId
        );
        if (revocation.revoked) {
          return { ok: false, status: 401, code: "scanner_token_revoked" };
        }
        return authorize(
          {
            version: p.version,
            userId: p.userId ?? null,
            staffMemberId: p.staffMemberId ?? null,
            eventId: p.eventId,
            role: p.role,
            codeType: p.codeType,
            actions: p.actions,
            entranceId: p.entranceId ?? null,
          },
          requires,
          requestId,
          opts.recheckMembership,
          opts.entityRoles
        );
      }
      // Malformed/tampered/expired/wrong-event: matches Phase 0 (496e1ccf8)
      // exactly - falls through to cookie, then guest, auth below.
    } else {
      // Not in scanner-token format: try it as a Supabase Auth token. This is
      // an account, not a scanner token, so it is always re-checked - same
      // as a cookie session - regardless of opts.recheckMembership.
      const { data: authData } = await admin.auth.getUser(token);
      if (authData?.user) {
        return authorize(
          {
            version: 1,
            userId: authData.user.id,
            staffMemberId: null,
            eventId,
            role: "signed_in",
            codeType: ["ticket"],
            actions: ["check_in"],
            entranceId: null,
          },
          requires,
          requestId,
          true,
          opts.entityRoles
        );
      }
      // Bearer header present but neither a scanner token nor a valid
      // Supabase Auth token: treated as absent credentials, same as the
      // cookie fallback below.
    }
  }

  // Cookie session (signed-in platform user).
  const supabase = await createSupabaseServer();
  const { data: serverAuth } = await supabase.auth.getUser();
  if (serverAuth?.user) {
    return authorize(
      {
        version: 1,
        userId: serverAuth.user.id,
        staffMemberId: null,
        eventId,
        role: "signed_in",
        codeType: ["ticket"],
        actions: ["check_in"],
        entranceId: null,
      },
      requires,
      requestId,
      true,
      opts.entityRoles
    );
  }

  // Guest (account-less) staff session cookie. Gated behind the guest
  // scanner rollout flag: with it off, this branch must not authenticate at
  // all on scanner-dataset or scanner-sync, matching Phase 0 (496e1ccf8),
  // where guest auth did not exist on either route.
  if (isGuestScannerEnabled() && EVENT_ID_UUID_RE.test(eventId)) {
    const cookies = parseCookieHeader(req.headers.get("cookie") || "");
    const sessionToken = cookies[eventStaffSessionCookieName(eventId)];
    if (sessionToken) {
      const session = await validateEventStaffSession(eventId, sessionToken);
      if (session) {
        return authorize(
          {
            version: 1,
            userId: null,
            staffMemberId: session.staffMemberId,
            eventId,
            role: session.role,
            codeType: ["ticket"],
            actions: ["check_in"],
            entranceId: session.entranceId,
          },
          requires,
          requestId
        );
      }
    }
  }

  return { ok: false, status: 401, code: "not_signed_in" };
}
