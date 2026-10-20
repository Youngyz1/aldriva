import { NextResponse } from "next/server";
import {
  KITCHEN_DISPLAY_COOKIE,
  KITCHEN_INVITE_COOKIE_PATH,
  KITCHEN_SESSION_COOKIE,
} from "@/lib/kitchen/worker-session";

export const KITCHEN_PRIVACY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export function kitchenJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: KITCHEN_PRIVACY_HEADERS });
}

export function setInviteCookie(response: NextResponse, token: string): void {
  response.cookies.set("aldriva_kitchen_invite", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: KITCHEN_INVITE_COOKIE_PATH,
    maxAge: 10 * 60,
  });
}

export function clearInviteCookie(response: NextResponse): void {
  response.cookies.set("aldriva_kitchen_invite", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: KITCHEN_INVITE_COOKIE_PATH,
    maxAge: 0,
  });
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  const expiryMs = Date.parse(expiresAt);
  const maxAge = Number.isFinite(expiryMs)
    ? Math.max(0, Math.min(30 * 24 * 60 * 60, Math.floor((expiryMs - Date.now()) / 1000)))
    : 0;
  response.cookies.set(KITCHEN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(KITCHEN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setDisplayCookie(response: NextResponse, token: string): void {
  // The DB link has no time expiry; revocation and token rotation are the
  // validity source. This persistent browser cookie is intentionally long-lived.
  response.cookies.set(KITCHEN_DISPLAY_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    // The board endpoint is shared by cook sessions and the display link.
    path: "/api/kitchen",
    maxAge: 365 * 24 * 60 * 60,
  });
}
