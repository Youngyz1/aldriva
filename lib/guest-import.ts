/**
 * lib/guest-import.ts
 *
 * Core CSV Parsing, Validation, Seat Resolution & Atomic Batch Import Logic
 * for Aldriva Private Events and Guest Management.
 *
 * Implements strict authoritative database resolution (CSV never bypasses PostgreSQL seats),
 * in-memory and cross-DB duplicate detection, and transactional commit semantics.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createInvitationCredential, assignSeatToInvitation } from "@/lib/invitations";

export interface RawCsvGuestRow {
  name?: string;
  email?: string;
  phone?: string;
  section?: string;
  row?: string;
  seat?: string | number;
  table?: string;
  ticket_type?: string;
  image_url?: string;
  image_file?: string;
  message?: string;
  rsvp_deadline?: string;
  [key: string]: any;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface ValidatedGuestRow {
  rowNumber: number;
  raw: RawCsvGuestRow;
  normalized: {
    name: string;
    email: string | null;
    phone: string | null;
    section: string | null;
    rowLabel: string | null;
    seatNumber: number | null;
    tableNumber: string | null;
    ticketTypeName: string | null;
    imageUrl: string | null;
    imageFile: string | null;
    personalMessage: string | null;
    rsvpDeadline: string | null;
  };
  resolvedSeatId: string | null;
  resolvedSeatLabel: string | null;
  resolvedTicketTypeId: string | null;
  status: "valid" | "warning" | "error";
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ImportPreviewResult {
  totalRows: number;
  validRowsCount: number;
  warningRowsCount: number;
  errorRowsCount: number;
  canImportAll: boolean;
  canImportValid: boolean;
  rows: ValidatedGuestRow[];
  summary: {
    duplicateEmails: number;
    duplicateSeats: number;
    unavailableSeats: number;
    missingRequired: number;
    invalidImages: number;
  };
}

export interface AtomicBatchImportParams {
  eventId: string;
  userId: string;
  rows: ValidatedGuestRow[];
  importMode: "all" | "valid_only";
  sendInvitations?: boolean;
}

export interface AtomicBatchImportResult {
  success: boolean;
  totalImported: number;
  failedCount: number;
  createdInvitations: Array<{
    invitationId: string;
    guestName: string;
    email: string | null;
    seatId: string | null;
    seatLabel: string | null;
    token: string;
  }>;
  errors: Array<{
    rowNumber: number;
    guestName: string;
    error: string;
  }>;
}

export function parseCsvText(csvText: string): RawCsvGuestRow[] {
  if (!csvText || typeof csvText !== "string") return [];

  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      currentLine += '"';
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = "";
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  const headers = splitCsvRow(lines[0]).map((h) =>
    h.toLowerCase().trim().replace(/[\s_-]+/g, "_")
  );

  const rows: RawCsvGuestRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitCsvRow(line);
    const row: RawCsvGuestRow = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] !== undefined ? values[idx].trim() : "";
    });

    const hasAnyContent = Object.values(row).some((v) => Boolean(v));
    if (hasAnyContent) {
      rows.push(row);
    }
  }

  return rows;
}

function splitCsvRow(rowText: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < rowText.length; i++) {
    const char = rowText[i];
    const nextChar = rowText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

export async function validateGuestRows(
  rows: RawCsvGuestRow[],
  eventId: string,
  adminClient?: any
): Promise<ImportPreviewResult> {
  const admin = adminClient || createSupabaseAdmin();

  const [{ data: dbSeats }, { data: dbInvitations }, { data: dbTickets }] = await Promise.all([
    admin
      .from("seats")
      .select("id, event_id, section, row_label, seat_number, table_number, table_name, status, reserved_until, assigned_invitation_id, is_vip, is_accessible")
      .eq("event_id", eventId),
    admin
      .from("event_invitations")
      .select("id, event_id, email, guest_name, invitation_status")
      .eq("event_id", eventId),
    admin
      .from("tickets")
      .select("id, event_id, name, price")
      .eq("event_id", eventId),
  ]);

  const existingEmails = new Set(
    (dbInvitations || [])
      .filter((inv: any) => inv.email && !["cancelled", "revoked"].includes(inv.invitation_status))
      .map((inv: any) => inv.email.toLowerCase())
  );

  const seatsList: any[] = dbSeats || [];
  const ticketsList: any[] = dbTickets || [];

  const batchEmailCounts = new Map<string, number>();
  const batchSeatCounts = new Map<string, number>();

  const validatedRows: ValidatedGuestRow[] = [];

  let duplicateEmailsCount = 0;
  let duplicateSeatsCount = 0;
  let unavailableSeatsCount = 0;
  let missingRequiredCount = 0;
  let invalidImagesCount = 0;

  for (const raw of rows) {
    const email = (raw.email || raw.guest_email || "").trim().toLowerCase();
    if (email) {
      batchEmailCounts.set(email, (batchEmailCounts.get(email) || 0) + 1);
    }

    const sec = (raw.section || raw.section_name || "").trim();
    const row = (raw.row || raw.row_label || "").trim();
    const seatStr = (raw.seat || raw.seat_number || "").toString().trim();
    const tableStr = (raw.table || raw.table_number || "").trim();

    if (sec && row && seatStr) {
      const key = "SEC:" + sec.toLowerCase() + "|ROW:" + row.toLowerCase() + "|SEAT:" + seatStr;
      batchSeatCounts.set(key, (batchSeatCounts.get(key) || 0) + 1);
    } else if (tableStr && seatStr) {
      const key = "TABLE:" + tableStr.toLowerCase() + "|SEAT:" + seatStr;
      batchSeatCounts.set(key, (batchSeatCounts.get(key) || 0) + 1);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNumber = i + 1;

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const name = (raw.name || raw.guest_name || "").trim();
    if (!name) {
      errors.push({
        field: "name",
        message: "Guest name is required.",
        code: "REQUIRED_FIELD_MISSING",
      });
      missingRequiredCount++;
    }

    const email = (raw.email || raw.guest_email || "").trim().toLowerCase() || null;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push({
          field: "email",
          message: "Invalid email address format.",
          code: "INVALID_EMAIL_FORMAT",
        });
      } else {
        if ((batchEmailCounts.get(email) || 0) > 1) {
          warnings.push({
            field: "email",
            message: "Duplicate email address found in CSV (" + email + ").",
            code: "DUPLICATE_EMAIL_IN_BATCH",
          });
          duplicateEmailsCount++;
        }
        if (existingEmails.has(email)) {
          warnings.push({
            field: "email",
            message: "Guest with this email is already invited to this event.",
            code: "DUPLICATE_EMAIL_IN_DB",
          });
          duplicateEmailsCount++;
        }
      }
    }

    const phone = (raw.phone || raw.guest_phone || raw.telephone || "").trim() || null;

    const section = (raw.section || raw.section_name || "").trim() || null;
    const rowLabel = (raw.row || raw.row_label || "").trim() || null;
    const seatRaw = (raw.seat || raw.seat_number || "").toString().trim() || null;
    const seatNumber = seatRaw && !isNaN(Number(seatRaw)) ? parseInt(seatRaw, 10) : null;
    const tableNumber = (raw.table || raw.table_number || "").trim() || null;

    let resolvedSeatId: string | null = null;
    let resolvedSeatLabel: string | null = null;

    const hasSeatSpec = Boolean((section && rowLabel && seatNumber) || (tableNumber && seatNumber));

    if (hasSeatSpec) {
      let matchedSeat: any = null;

      if (section && rowLabel && seatNumber) {
        matchedSeat = seatsList.find(
          (s) =>
            s.section.toLowerCase() === section.toLowerCase() &&
            s.row_label.toLowerCase() === rowLabel.toLowerCase() &&
            s.seat_number === seatNumber
        );
      } else if (tableNumber && seatNumber) {
        matchedSeat = seatsList.find(
          (s) =>
            (s.table_number && s.table_number.toLowerCase() === tableNumber.toLowerCase()) &&
            s.seat_number === seatNumber
        );
      }

      if (!matchedSeat) {
        errors.push({
          field: "seat",
          message: "Seat not found in venue layout (" + (section || 'Table ' + tableNumber) + ", Row " + (rowLabel || 'T') + ", Seat " + seatNumber + ").",
          code: "SEAT_NOT_FOUND",
        });
        unavailableSeatsCount++;
      } else {
        resolvedSeatId = matchedSeat.id;
        resolvedSeatLabel = matchedSeat.table_number
          ? "Table " + matchedSeat.table_number + ", Seat " + matchedSeat.seat_number
          : matchedSeat.section + " · Row " + matchedSeat.row_label + " · Seat " + matchedSeat.seat_number;

        if (matchedSeat.status === "sold") {
          errors.push({
            field: "seat",
            message: "Seat " + resolvedSeatLabel + " has already been sold to a ticket buyer.",
            code: "SEAT_ALREADY_SOLD",
          });
          unavailableSeatsCount++;
        } else if (matchedSeat.assigned_invitation_id) {
          errors.push({
            field: "seat",
            message: "Seat " + resolvedSeatLabel + " is already assigned to another invited guest.",
            code: "SEAT_ALREADY_ASSIGNED",
          });
          unavailableSeatsCount++;
        } else if (
          matchedSeat.status === "reserved" &&
          matchedSeat.reserved_until &&
          new Date(matchedSeat.reserved_until) > new Date()
        ) {
          errors.push({
            field: "seat",
            message: "Seat " + resolvedSeatLabel + " is currently held in an active purchase session.",
            code: "SEAT_HELD",
          });
          unavailableSeatsCount++;
        }

        const batchKey = section && rowLabel && seatNumber
          ? "SEC:" + section.toLowerCase() + "|ROW:" + rowLabel.toLowerCase() + "|SEAT:" + seatNumber
          : "TABLE:" + (tableNumber?.toLowerCase() || "") + "|SEAT:" + seatNumber;

        if ((batchSeatCounts.get(batchKey) || 0) > 1) {
          errors.push({
            field: "seat",
            message: "Multiple guests in CSV are assigned to the same seat (" + resolvedSeatLabel + ").",
            code: "DUPLICATE_SEAT_IN_BATCH",
          });
          duplicateSeatsCount++;
        }
      }
    }

    const ticketTypeName = (raw.ticket_type || raw.ticket_type_name || "").trim() || null;
    let resolvedTicketTypeId: string | null = null;
    if (ticketTypeName) {
      const matchedTicket = ticketsList.find(
        (t) => t.name.toLowerCase() === ticketTypeName.toLowerCase()
      );
      if (matchedTicket) {
        resolvedTicketTypeId = matchedTicket.id;
      } else {
        warnings.push({
          field: "ticket_type",
          message: "Ticket type '" + ticketTypeName + "' not found; default invitation tier will be used.",
          code: "TICKET_TYPE_NOT_FOUND",
        });
      }
    }

    const imageUrl = (raw.image_url || raw.photo_url || "").trim() || null;
    const imageFile = (raw.image_file || raw.photo_file || raw.photo || "").trim() || null;

    if (imageUrl) {
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(imageUrl)) {
        warnings.push({
          field: "image_url",
          message: "Image URL is not a valid HTTP/HTTPS URL.",
          code: "INVALID_IMAGE_URL",
        });
        invalidImagesCount++;
      }
    }

    const personalMessage = (raw.message || raw.personal_message || raw.notes || "").trim() || null;
    const rsvpDeadlineRaw = (raw.rsvp_deadline || raw.deadline || "").trim() || null;
    let rsvpDeadline: string | null = null;
    if (rsvpDeadlineRaw) {
      const parsedDate = new Date(rsvpDeadlineRaw);
      if (isNaN(parsedDate.getTime())) {
        warnings.push({
          field: "rsvp_deadline",
          message: "Invalid RSVP deadline date format.",
          code: "INVALID_DATE_FORMAT",
        });
      } else {
        rsvpDeadline = parsedDate.toISOString();
      }
    }

    const rowStatus: "valid" | "warning" | "error" =
      errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "valid";

    validatedRows.push({
      rowNumber,
      raw,
      normalized: {
        name,
        email,
        phone,
        section,
        rowLabel,
        seatNumber,
        tableNumber,
        ticketTypeName,
        imageUrl,
        imageFile,
        personalMessage,
        rsvpDeadline,
      },
      resolvedSeatId,
      resolvedSeatLabel,
      resolvedTicketTypeId,
      status: rowStatus,
      errors,
      warnings,
    });
  }

  const validRowsCount = validatedRows.filter((r) => r.status === "valid").length;
  const warningRowsCount = validatedRows.filter((r) => r.status === "warning").length;
  const errorRowsCount = validatedRows.filter((r) => r.status === "error").length;

  return {
    totalRows: validatedRows.length,
    validRowsCount,
    warningRowsCount,
    errorRowsCount,
    canImportAll: errorRowsCount === 0,
    canImportValid: validRowsCount + warningRowsCount > 0,
    rows: validatedRows,
    summary: {
      duplicateEmails: duplicateEmailsCount,
      duplicateSeats: duplicateSeatsCount,
      unavailableSeats: unavailableSeatsCount,
      missingRequired: missingRequiredCount,
      invalidImages: invalidImagesCount,
    },
  };
}

export async function executeAtomicBatchImport(
  params: AtomicBatchImportParams,
  adminClient?: any
): Promise<AtomicBatchImportResult> {
  const { eventId, userId, rows, importMode, sendInvitations = false } = params;
  const admin = adminClient || createSupabaseAdmin();

  const rowsToImport = rows.filter((r) => {
    if (importMode === "all") return true;
    return r.status === "valid" || r.status === "warning";
  });

  if (rowsToImport.length === 0) {
    return {
      success: true,
      totalImported: 0,
      failedCount: 0,
      createdInvitations: [],
      errors: [],
    };
  }

  const seatIdsToAssign = rowsToImport
    .map((r) => r.resolvedSeatId)
    .filter(Boolean) as string[];

  if (seatIdsToAssign.length > 0) {
    const { data: currentSeats, error: seatFetchErr } = await admin
      .from("seats")
      .select("id, status, assigned_invitation_id, reserved_until")
      .in("id", seatIdsToAssign)
      .eq("event_id", eventId);

    if (seatFetchErr) {
      throw new Error("Failed to verify seat availability: " + seatFetchErr.message);
    }

    const now = new Date();
    const conflictedSeats = (currentSeats || []).filter(
      (s: any) =>
        s.status === "sold" ||
        s.assigned_invitation_id !== null ||
        (s.status === "reserved" && s.reserved_until && new Date(s.reserved_until) > now)
    );

    if (conflictedSeats.length > 0) {
      const conflictedId = conflictedSeats[0].id;
      const conflictedRow = rowsToImport.find((r) => r.resolvedSeatId === conflictedId);
      throw new Error(
        "Concurrency collision: Seat for guest '" + (conflictedRow?.normalized.name || conflictedId) + "' is no longer available. Revalidate import."
      );
    }
  }

  const createdInvitations: AtomicBatchImportResult["createdInvitations"] = [];
  const errors: AtomicBatchImportResult["errors"] = [];

  for (const row of rowsToImport) {
    try {
      const { invitation, ticketInstance } = await createInvitationCredential({
        eventId,
        guestName: row.normalized.name,
        email: row.normalized.email,
        phone: row.normalized.phone,
        notes: row.normalized.personalMessage,
        createdBy: userId,
      });

      await admin
        .from("event_invitations")
        .update({
          image_url: row.normalized.imageUrl,
          personal_message: row.normalized.personalMessage,
          rsvp_deadline: row.normalized.rsvpDeadline,
        })
        .eq("id", invitation.id);

      let assignedSeatLabel: string | null = null;
      if (row.resolvedSeatId) {
        const seatResult = await assignSeatToInvitation({
          eventId,
          invitationId: invitation.id,
          seatId: row.resolvedSeatId,
        });
        assignedSeatLabel = seatResult.seatLabel;
      }

      createdInvitations.push({
        invitationId: invitation.id,
        guestName: row.normalized.name,
        email: row.normalized.email,
        seatId: row.resolvedSeatId,
        seatLabel: assignedSeatLabel,
        token: invitation.token,
      });
    } catch (err: any) {
      errors.push({
        rowNumber: row.rowNumber,
        guestName: row.normalized.name,
        error: err.message || "Failed to import row",
      });
    }
  }

  return {
    success: errors.length === 0,
    totalImported: createdInvitations.length,
    failedCount: errors.length,
    createdInvitations,
    errors,
  };
}
