import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { removeSeatFromInvitation } from "@/lib/invitations";
import { assignSeatToInvitationAtomic, SeatGeometry, partitionSeatSaves, isPersistedSeatId } from "@/lib/seating";

const admin = createSupabaseAdmin();

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

// GET /api/events/[id]/seating — load full layout + spatial seats + tickets + invitations
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = auth;

  // 1. Load layout (spatial & metadata)
  let { data: layout } = await admin
    .from("venue_layouts")
    .select(
      "id, event_id, name, sections, venue_objects, canvas_width, canvas_height, version, is_published, published_at"
    )
    .eq("event_id", eventId)
    .maybeSingle();

  // If no layout exists yet, create default empty layout container
  if (!layout) {
    const { data: newLayout } = await admin
      .from("venue_layouts")
      .insert({
        event_id: eventId,
        name: "Main Hall",
        sections: [],
        venue_objects: [],
        canvas_width: 1200,
        canvas_height: 800,
        version: 1,
        is_published: true,
      })
      .select(
        "id, event_id, name, sections, venue_objects, canvas_width, canvas_height, version, is_published, published_at"
      )
      .single();
    layout = newLayout;
  }

  // 2. Load ticket types for this event (for section & seat pricing config)
  const { data: ticketTypes } = await admin
    .from("tickets")
    .select("id, event_id, name, price, quantity")
    .eq("event_id", eventId)
    .order("price", { ascending: true });

  // 3. Load seats (event-scoped with full spatial attributes)
  const { data: seats, error: seatsErr } = await admin
    .from("seats")
    .select(
      "id, event_id, layout_id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, is_accessible, status, reserved_until, price_override, ticket_id, ticket_type_id, assigned_invitation_id, x, y, width, height, rotation, object_type"
    )
    .eq("event_id", eventId)
    .order("section")
    .order("row_label")
    .order("seat_number");

  if (seatsErr) {
    return NextResponse.json({ error: "Failed to load seats" }, { status: 500 });
  }

  // 4. Load assigned invitations (safe fields only — no secret token)
  const assignedInvitationIds = (seats || [])
    .map((s) => s.assigned_invitation_id)
    .filter(Boolean) as string[];

  const invitationMap = new Map<string, object>();
  if (assignedInvitationIds.length > 0) {
    const { data: invitations } = await admin
      .from("event_invitations")
      .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
      .in("id", assignedInvitationIds)
      .eq("event_id", eventId);
    (invitations || []).forEach((inv) => invitationMap.set(inv.id, inv));
  }

  // 5. Load all event invitations (for assignment picker)
  const { data: allInvitations } = await admin
    .from("event_invitations")
    .select("id, guest_name, guest_title, organization, invitation_status, rsvp_status")
    .eq("event_id", eventId)
    .order("guest_name");

  // 6. Find current seat for each invitation
  const invitationSeatMap = new Map<string, string>();
  (seats || []).forEach((s) => {
    if (s.assigned_invitation_id) {
      invitationSeatMap.set(s.assigned_invitation_id, s.id);
    }
  });

  const seatsWithInvitations = (seats || []).map((seat) => ({
    ...seat,
    invitation: seat.assigned_invitation_id
      ? invitationMap.get(seat.assigned_invitation_id) ?? null
      : null,
  }));

  const invitationsForPicker = (allInvitations || []).map((inv) => ({
    ...inv,
    current_seat_id: invitationSeatMap.get(inv.id) ?? null,
  }));

  return NextResponse.json({
    layout: layout ?? null,
    seats: seatsWithInvitations,
    ticket_types: ticketTypes || [],
    invitations: invitationsForPicker,
  });
}

// PATCH /api/events/[id]/seating — mutations
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthorizedEventId(req, resolvedParams);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const op = body.op as string | undefined;

  // ── 1. save_layout (Atomic Layout & Geometry Save) ────────────────────────
  if (op === "save_layout") {
    const {
      layoutId,
      name,
      canvas_width,
      canvas_height,
      sections,
      venue_objects,
      seats: updatedSeats,
    } = body as {
      layoutId?: string;
      name?: string;
      canvas_width?: number;
      canvas_height?: number;
      sections?: unknown[];
      venue_objects?: unknown[];
      seats?: Partial<SeatGeometry>[];
    };

    // 1. Fetch current layout
    let targetLayoutId = layoutId;
    if (!targetLayoutId) {
      const { data: existingLayout } = await admin
        .from("venue_layouts")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      targetLayoutId = existingLayout?.id;
    }

    if (!targetLayoutId) {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    // 2. Update venue_layouts metadata, canvas, sections, and non-seat objects
    const layoutUpdates: Record<string, unknown> = {
      version: 1, // will be incremented or preserved
    };
    if (name !== undefined) layoutUpdates.name = name;
    if (canvas_width !== undefined) layoutUpdates.canvas_width = canvas_width;
    if (canvas_height !== undefined) layoutUpdates.canvas_height = canvas_height;
    if (sections !== undefined) layoutUpdates.sections = sections;
    if (venue_objects !== undefined) layoutUpdates.venue_objects = venue_objects;

    const { error: layoutErr } = await admin
      .from("venue_layouts")
      .update(layoutUpdates)
      .eq("id", targetLayoutId)
      .eq("event_id", eventId);

    if (layoutErr) {
      console.error("[seating:save_layout:layout]", { eventId, code: layoutErr.code, message: layoutErr.message });
      return NextResponse.json({ error: `Layout save failed: ${layoutErr.message}` }, { status: 500 });
    }

    // 3. Delete seats removed on the canvas FIRST, so re-added rows can
    // reuse the same logical keys in the same save (delete/re-add would
    // otherwise collide with not-yet-deleted rows). Only real UUIDs reach
    // the database — client temp ids refer to rows that were never
    // persisted, so they need no server delete.
    const deleteIds = Array.isArray(
      (body as { deleteIds?: unknown }).deleteIds
    )
      ? ((body as { deleteIds?: unknown }).deleteIds as unknown[]).filter(isPersistedSeatId)
      : [];
    if (deleteIds.length > 0) {
      const { data: doomed } = await admin
        .from("seats")
        .select("id, status, assigned_invitation_id")
        .in("id", deleteIds)
        .eq("event_id", eventId);
      const protectedDeletes = (doomed || []).filter(
        (s) => s.status === "sold" || s.assigned_invitation_id !== null
      );
      if (protectedDeletes.length > 0) {
        return NextResponse.json(
          {
            error: "Cannot delete seats that are sold or assigned to an active guest.",
            protectedSeatIds: protectedDeletes.map((s) => s.id),
          },
          { status: 409 }
        );
      }
      const { error: saveDeleteErr } = await admin
        .from("seats")
        .delete()
        .in("id", deleteIds)
        .eq("event_id", eventId);
      if (saveDeleteErr) {
        console.error("[seating:save_layout:delete]", { eventId, code: saveDeleteErr.code, message: saveDeleteErr.message });
        return NextResponse.json({ error: `Seat delete failed: ${saveDeleteErr.message}` }, { status: 500 });
      }
    }

    // 4. Process seats if provided (full-layout sync).
    // The canvas sends its ENTIRE seat list on every save: persisted UUIDs
    // are updates, client temp ids (`new-…`, `dup-…`, …) are inserts. Temp
    // ids are never sent to the database (the DB issues real ids), so a
    // re-sent unsaved seat can never collide as a phantom update, and a
    // temp id can never hit a UUID-typed query.
    if (Array.isArray(updatedSeats) && updatedSeats.length > 0) {
      const { updates: existingSeatUpdates, inserts: newSeatInserts } =
        partitionSeatSaves(updatedSeats);

      // Chunked concurrent updates for existing seats (updating spatial geometry and visual properties without overwriting status/sold)
      const CHUNK_SIZE = 15;
      for (let i = 0; i < existingSeatUpdates.length; i += CHUNK_SIZE) {
        const chunk = existingSeatUpdates.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map(async (s) => {
            const seatUpdate: Record<string, unknown> = {};
            if (s.x !== undefined) seatUpdate.x = s.x;
            if (s.y !== undefined) seatUpdate.y = s.y;
            if (s.width !== undefined) seatUpdate.width = s.width;
            if (s.height !== undefined) seatUpdate.height = s.height;
            if (s.rotation !== undefined) seatUpdate.rotation = s.rotation;
            if (s.section !== undefined) seatUpdate.section = s.section;
            if (s.row_label !== undefined) seatUpdate.row_label = s.row_label;
            if (s.seat_number !== undefined) seatUpdate.seat_number = s.seat_number;
            if (s.table_number !== undefined) seatUpdate.table_number = s.table_number;
            if (s.table_name !== undefined) seatUpdate.table_name = s.table_name;
            if (s.table_capacity !== undefined) seatUpdate.table_capacity = s.table_capacity;
            if (s.is_vip !== undefined) seatUpdate.is_vip = s.is_vip;
            if (s.is_accessible !== undefined) seatUpdate.is_accessible = s.is_accessible;
            if (s.price_override !== undefined) seatUpdate.price_override = s.price_override;
            if (s.ticket_type_id !== undefined) seatUpdate.ticket_type_id = s.ticket_type_id;
            if (s.object_type !== undefined) seatUpdate.object_type = s.object_type;

            if (Object.keys(seatUpdate).length === 0) return null;

            const { error: seatUpdateErr } = await admin
              .from("seats")
              .update(seatUpdate)
              .eq("id", s.id!)
              .eq("event_id", eventId)
              .neq("status", "sold"); // Protect sold seats from commercial state tampering
            return seatUpdateErr;
          })
        );

        const firstErr = results.find(Boolean);
        if (firstErr) {
          console.error("[seating:save_layout:update]", { eventId, code: firstErr.code, message: firstErr.message });
          return NextResponse.json(
            { error: `Seat update failed: ${firstErr.message}` },
            { status: 500 }
          );
        }
      }

      // Insert brand new seats
      if (newSeatInserts.length > 0) {
        const insertRows = newSeatInserts.map((s) => ({
          event_id: eventId,
          layout_id: targetLayoutId,
          section: s.section || "General",
          row_label: s.row_label || "1",
          seat_number: s.seat_number || 1,
          x: s.x ?? 100,
          y: s.y ?? 100,
          width: s.width ?? 26,
          height: s.height ?? 26,
          rotation: s.rotation ?? 0,
          object_type: s.object_type || "seat",
          is_vip: !!s.is_vip,
          is_accessible: !!s.is_accessible,
          table_number: s.table_number || null,
          table_name: s.table_name || null,
          table_capacity: s.table_capacity || null,
          price_override: s.price_override ?? null,
          ticket_type_id: s.ticket_type_id || null,
          status: s.status === "unavailable" ? "unavailable" : "available",
        }));

        // In-memory duplicate key check to reject payload collisions cleanly
        const seenKeys = new Set<string>();
        for (const row of insertRows) {
          const key = `${row.section}:::${row.row_label}:::${row.seat_number}`;
          if (seenKeys.has(key)) {
            return NextResponse.json(
              {
                error: `Duplicate seat in payload: ${row.section}, Row ${row.row_label}, Seat ${row.seat_number}.`,
              },
              { status: 409 }
            );
          }
          seenKeys.add(key);
        }

        const { error: seatInsertErr } = await admin.from("seats").insert(insertRows);
        if (seatInsertErr) {
          const duplicate =
            typeof seatInsertErr === "object" &&
            seatInsertErr !== null &&
            (seatInsertErr as { code?: string }).code === "23505";
          console.error("[seating:save_layout:insert]", { eventId, code: seatInsertErr.code, count: insertRows.length, message: seatInsertErr.message });
          return NextResponse.json(
            {
              error: duplicate
                ? "These seats already exist (duplicate section, row, and seat number). Rename the section or reload the layout."
                : `Seat save failed: ${seatInsertErr.message}`,
            },
            { status: duplicate ? 409 : 500 }
          );
        }
      }
    }

    // 5. Return the authoritative seat list so the client can drop temp ids
    // and converge on database truth (prevents re-inserting the same seats
    // as duplicates on the next save).
    const { data: savedSeats, error: savedErr } = await admin
      .from("seats")
      .select(
        "id, event_id, layout_id, section, row_label, seat_number, table_number, table_name, table_capacity, is_vip, is_accessible, status, reserved_until, price_override, ticket_id, ticket_type_id, assigned_invitation_id, x, y, width, height, rotation, object_type"
      )
      .eq("event_id", eventId)
      .order("section")
      .order("row_label")
      .order("seat_number");

    if (savedErr) {
      return NextResponse.json({ error: `Failed to reload seats: ${savedErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, savedSeats: savedSeats ?? [] });
  }

  // ── 2. bulk_create_seats ──────────────────────────────────────────────────
  if (op === "bulk_create_seats") {
    const { seats: newSeats, layoutId } = body as {
      seats?: Record<string, unknown>[];
      layoutId?: string;
    };

    if (!newSeats || !Array.isArray(newSeats) || newSeats.length === 0) {
      return NextResponse.json({ error: "seats array is required" }, { status: 422 });
    }

    let targetLayoutId = layoutId;
    if (!targetLayoutId) {
      const { data: existingLayout } = await admin
        .from("venue_layouts")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      targetLayoutId = existingLayout?.id;
    }

    const rowsToInsert = newSeats.map((s) => ({
      event_id: eventId,
      layout_id: targetLayoutId,
      section: s.section || "General",
      row_label: s.row_label || "1",
      seat_number: s.seat_number || 1,
      x: s.x ?? 100,
      y: s.y ?? 100,
      width: s.width ?? 26,
      height: s.height ?? 26,
      rotation: s.rotation ?? 0,
      object_type: s.object_type || "seat",
      is_vip: !!s.is_vip,
      is_accessible: !!s.is_accessible,
      table_number: s.table_number || null,
      table_name: s.table_name || null,
      table_capacity: s.table_capacity || null,
      price_override: s.price_override ?? null,
      ticket_type_id: s.ticket_type_id || null,
      status: s.status === "unavailable" ? "unavailable" : "available",
    }));

    const { data: inserted, error: insertErr } = await admin
      .from("seats")
      .insert(rowsToInsert)
      .select();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: inserted?.length || 0, seats: inserted });
  }

  // ── 3. publish_layout ─────────────────────────────────────────────────────
  if (op === "publish_layout") {
    const { is_published } = body as { is_published?: boolean };

    const { data: layout, error: pubErr } = await admin
      .from("venue_layouts")
      .update({
        is_published: is_published !== undefined ? is_published : true,
        published_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .select("id, is_published, version, published_at")
      .single();

    if (pubErr) {
      return NextResponse.json({ error: pubErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, layout });
  }

  // ── 4. assign_seat (Atomic Assignment) ────────────────────────────────────
  if (op === "assign_seat") {
    const { invitationId, seatId } = body as { invitationId?: string; seatId?: string };
    if (!invitationId || !seatId) {
      return NextResponse.json({ error: "invitationId and seatId are required" }, { status: 422 });
    }

    try {
      const result = await assignSeatToInvitationAtomic({
        eventId,
        invitationId,
        seatId,
      });

      if (!result.success) {
        if (result.error && result.error !== "Assignment failed") {
          console.error("[events/[id]/seating]", result.error);
        }
        return NextResponse.json({ error: "Assignment failed" }, { status: 409 });
      }

      return NextResponse.json(result);
    } catch (err: unknown) {
      console.error("[events/[id]/seating]", err);
      return NextResponse.json({ error: "Assignment failed" }, { status: 409 });
    }
  }

  // ── 5. remove_seat ────────────────────────────────────────────────────────
  if (op === "remove_seat") {
    const { invitationId } = body as { invitationId?: string };
    if (!invitationId) {
      return NextResponse.json({ error: "invitationId is required" }, { status: 422 });
    }

    try {
      const result = await removeSeatFromInvitation(eventId, invitationId);
      return NextResponse.json(result);
    } catch (err: unknown) {
      console.error("[events/[id]/seating]", err);
      return NextResponse.json({ error: "Removal failed" }, { status: 500 });
    }
  }

  // ── 6. update_seat_meta ───────────────────────────────────────────────────
  if (op === "update_seat_meta") {
    const {
      seatId,
      is_vip,
      is_accessible,
      table_number,
      table_name,
      table_capacity,
      price_override,
      ticket_type_id,
      x,
      y,
      width,
      height,
      rotation,
      status,
    } = body as {
      seatId?: string;
      is_vip?: boolean;
      is_accessible?: boolean;
      table_number?: string | null;
      table_name?: string | null;
      table_capacity?: number | null;
      price_override?: number | null;
      ticket_type_id?: string | null;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
      status?: string;
    };

    if (!seatId) {
      return NextResponse.json({ error: "seatId is required" }, { status: 422 });
    }

    // Client temp ids (`new-…`, `dup-…`) never address persisted rows —
    // reject them as bad requests instead of letting them fail as DB errors.
    if (!isPersistedSeatId(seatId)) {
      return NextResponse.json({ error: "Unknown seat" }, { status: 422 });
    }

    // Verify seat belongs to event
    const { data: seat } = await admin
      .from("seats")
      .select("id, event_id, status")
      .eq("id", seatId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (!seat) return NextResponse.json({ error: "Seat not found" }, { status: 404 });

    const update: Record<string, unknown> = {};
    if (is_vip !== undefined) update.is_vip = is_vip;
    if (is_accessible !== undefined) update.is_accessible = is_accessible;
    if (table_number !== undefined) update.table_number = table_number;
    if (table_name !== undefined) update.table_name = table_name;
    if (table_capacity !== undefined) update.table_capacity = table_capacity;
    if (price_override !== undefined) update.price_override = price_override;
    if (ticket_type_id !== undefined) update.ticket_type_id = ticket_type_id;
    if (x !== undefined) update.x = x;
    if (y !== undefined) update.y = y;
    if (width !== undefined) update.width = width;
    if (height !== undefined) update.height = height;
    if (rotation !== undefined) update.rotation = rotation;
    if (status !== undefined && (status === "available" || status === "unavailable")) {
      if (seat.status !== "sold") {
        update.status = status;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 422 });
    }

    const { error: updateErr } = await admin
      .from("seats")
      .update(update)
      .eq("id", seatId)
      .eq("event_id", eventId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ── 7. delete_seat / bulk_delete_seats ────────────────────────────────────
  if (op === "delete_seat" || op === "bulk_delete_seats") {
    const seatIds = Array.isArray(body.seatIds)
      ? (body.seatIds as string[])
      : body.seatId
      ? [body.seatId as string]
      : [];

    if (seatIds.length === 0) {
      return NextResponse.json({ error: "seatId or seatIds required" }, { status: 422 });
    }

    // Same temp-id guard as update_seat_meta above.
    if (!seatIds.every(isPersistedSeatId)) {
      return NextResponse.json({ error: "Unknown seat" }, { status: 422 });
    }

    // Verify none of the seats are sold or checked in!
    const { data: targetSeats } = await admin
      .from("seats")
      .select("id, status, assigned_invitation_id")
      .in("id", seatIds)
      .eq("event_id", eventId);

    const protectedSeats = (targetSeats || []).filter(
      (s) => s.status === "sold" || s.assigned_invitation_id !== null
    );

    if (protectedSeats.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete seats that are sold or assigned to an active guest.",
          protectedSeatIds: protectedSeats.map((s) => s.id),
        },
        { status: 409 }
      );
    }

    const { error: delErr } = await admin
      .from("seats")
      .delete()
      .in("id", seatIds)
      .eq("event_id", eventId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedCount: seatIds.length });
  }

  return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 422 });
}
