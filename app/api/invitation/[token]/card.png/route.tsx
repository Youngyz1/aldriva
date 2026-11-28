import { NextRequest, NextResponse } from "next/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return new NextResponse("Invalid invitation token", { status: 400 });
  }

  // No invitation templates ship with the platform, so there is no card
  // artwork to render. Return a clean error instead of a 500.
  return new NextResponse("Invitation card artwork is not available.", { status: 404 });
}
