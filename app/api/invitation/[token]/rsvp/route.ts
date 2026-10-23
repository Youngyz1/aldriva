import { NextRequest, NextResponse } from "next/server";
import { rsvpInvitation } from "@/lib/invitations";
import { isRateLimited, rateLimitedResponse } from "@/lib/memories/guest-limits";
import { InvitationNotFoundError, normalizeRsvpDetails, RsvpValidationError } from "@/lib/invitation-rsvp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
  }

  // Round 4: per-IP + per-token buckets (fail-open). Bounds RSVP spam
  // without blocking genuine guests when the limiter is down.
  if (await isRateLimited(req, "invitationRsvp", `token:${token}`)) {
    return rateLimitedResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 422 });
  }

  const response = body.response as "accepted" | "declined" | undefined;

  if (!response || !["accepted", "declined"].includes(response)) {
    return NextResponse.json(
      { error: "Invalid RSVP response. Must be 'accepted' or 'declined'." },
      { status: 422 }
    );
  }

  let details;
  try {
    details = normalizeRsvpDetails(response, body);
  } catch (err: unknown) {
    if (err instanceof RsvpValidationError) {
      return NextResponse.json({ error: "Invalid RSVP details." }, { status: 422 });
    }
    throw err;
  }

  try {
    const result = await rsvpInvitation({ token, response, ...details });
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof RsvpValidationError) {
      return NextResponse.json({ error: "Invalid RSVP details." }, { status: 422 });
    }
    if (err instanceof InvitationNotFoundError) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }
    console.error("[invitation/rsvp]", err);
    return NextResponse.json({ error: "Could not update RSVP." }, { status: 409 });
  }
}
