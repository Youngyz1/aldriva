import { NextResponse } from "next/server";
import { isRateLimited, rateLimitedResponse } from "@/lib/memories/guest-limits";
import { getPublicMemoriesService } from "@/lib/memories/public-gallery";
import { InvalidMemoryCursorError } from "@/lib/memories/public-gallery-core";

// No segment config here: `runtime = "nodejs"` is rejected when
// nextConfig.cacheComponents is enabled, and route handlers already run on
// Node by default. Cache-Control: no-store is set per response.
const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Public read-only guest Memories page.
 *
 * The token must be the invitation page's public share token (64-char hex,
 * the same token /invitation/shared/[token] uses) — no other token/slug
 * format is accepted. The event is resolved server-side; the response is
 * scoped to approved, non-reported photos and never exposes event ids,
 * object keys, delete tokens or guest labels.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (await isRateLimited(request, "invitationMemoriesView")) {
    return rateLimitedResponse();
  }

  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  if (cursor && cursor.length > 512) {
    return NextResponse.json({ error: "Invalid cursor." }, { status: 400, headers: NO_STORE });
  }

  try {
    const service = getPublicMemoriesService();
    const target = await service.resolveTarget(token);
    if (!target || !target.showMemories) {
      return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
    }

    const page = await service.listPage(target, cursor);
    return NextResponse.json(page, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof InvalidMemoryCursorError) {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(
      { error: "Could not load memories." },
      { status: 500, headers: NO_STORE }
    );
  }
}
