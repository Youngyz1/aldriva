import { NextRequest, NextResponse } from "next/server";
import { rsvpInvitation } from "@/lib/invitations";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
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

  try {
    const result = await rsvpInvitation({ token, response });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update RSVP.";
    const status = message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
