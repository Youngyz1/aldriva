import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { parseCsvText, validateGuestRows, executeAtomicBatchImport } from "@/lib/guest-import";

async function getAuthorizedEventId(
  req: NextRequest,
  params: { id: string }
): Promise<{ userId: string; eventId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = params.id;
  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { userId: user.id, eventId };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { userId, eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const op = body.op as string | undefined;

  // ── op: preview ────────────────────────────────────────────────────────────
  if (op === "preview") {
    const csvText = body.csvText as string;
    if (!csvText || typeof csvText !== "string") {
      return NextResponse.json({ error: "csvText is required for preview" }, { status: 422 });
    }

    try {
      const rawRows = parseCsvText(csvText);
      if (rawRows.length === 0) {
        return NextResponse.json(
          { error: "No valid guest rows found in CSV. Please ensure the file has a header row." },
          { status: 422 }
        );
      }

      const preview = await validateGuestRows(rawRows, eventId);
      return NextResponse.json(preview);
    } catch (err: any) {
      console.error("[events/[id]/guests/batch]", err);
      return NextResponse.json(
        { error: "Failed to parse and validate CSV." },
        { status: 500 }
      );
    }
  }

  // ── op: revalidate ─────────────────────────────────────────────────────────
  if (op === "revalidate") {
    const rows = body.rows as any[];
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows array is required for revalidation" }, { status: 422 });
    }

    try {
      const rawRows = rows.map((r) => r.raw || r);
      const preview = await validateGuestRows(rawRows, eventId);
      return NextResponse.json(preview);
    } catch (err: any) {
      console.error("[events/[id]/guests/batch]", err);
      return NextResponse.json(
        { error: "Failed to revalidate rows." },
        { status: 500 }
      );
    }
  }

  // ── op: commit ─────────────────────────────────────────────────────────────
  if (op === "commit") {
    const rows = body.rows as any[];
    const importMode = (body.importMode as "all" | "valid_only") || "valid_only";
    const sendInvitations = Boolean(body.sendInvitations);

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required for commit" }, { status: 422 });
    }

    try {
      const result = await executeAtomicBatchImport({
        eventId,
        userId,
        rows,
        importMode,
        sendInvitations,
      });

      return NextResponse.json(result);
    } catch (err: any) {
      console.error("[events/[id]/guests/batch]", err);
      return NextResponse.json(
        { error: "Batch import failed during atomic commit." },
        { status: 409 }
      );
    }
  }

  return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 422 });
}
